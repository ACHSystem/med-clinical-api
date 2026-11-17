# syntax=docker/dockerfile:1

# Imagen de produccion para Dokploy (build con Dockerfile).
# Etapas: deps (dev) -> build -> prod-deps -> runtime.
# El runtime NO incluye devDependencies ni el CLI de Prisma: solo Nest compilado
# y las dependencias de produccion. Las migraciones se ejecutan fuera del
# contenedor (por ejemplo, desde tu maquina con `pnpm exec prisma migrate deploy`).

ARG NODE_VERSION=24

# ---------- base ----------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN npm i -g pnpm@11.21.0
WORKDIR /app

# ---------- dependencias de build ----------
FROM base AS deps
# bcrypt compila desde fuente si no encuentra prebuild para la plataforma.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- build ----------
FROM deps AS build
# prisma.config.ts resuelve DATABASE_URL al cargarse. `prisma generate` no se
# conecta a la base, asi que basta un valor ficticio para el build.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY tsconfig.json tsconfig.build.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN pnpm exec prisma generate
RUN pnpm build

# ---------- solo dependencias de produccion ----------
FROM base AS prod-deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ---------- runtime ----------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

USER node

EXPOSE 3000

# GET /api esta protegido por AuthGuard: 401 significa que el proceso responde.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
