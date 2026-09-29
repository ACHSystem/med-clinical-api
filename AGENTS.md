# AGENTS.md

NestJS 11 + Prisma 7 + PostgreSQL REST API for a medical clinic (patients, medical
histories, custom intake forms, providers, service pricing, quotes).

- Domain language is **Spanish** (entity names, validation/exception messages, seed
  data). Code, identifiers and commit messages are English.
- **Product spec: `docs/ESPECIFICACIONES.md`** — read it before adding or changing
  features; it records what each module does today and what is still missing.
- `preview/app.js` is a standalone static HTML/JS UI mock (mock data at the top of the
  file). Design reference only — it is not wired to this API.

## BLOCKER: pnpm cannot run any script

`pnpm-workspace.yaml` contains the literal placeholder strings
`set this to true or false` in `allowBuilds`, so **every** `pnpm run <script>` and
`pnpm exec` aborts with `ERR_PNPM_IGNORED_BUILDS` (prisma, @prisma/engines, @swc/core,
bcrypt) before running anything. Set all four values to `true` in that file (or run
`pnpm approve-builds`) to unblock. Until then, call the tools directly:
`npx nest start`, `npx prisma migrate dev`, `npx jest`.

## Commands

- Dev watch: `pnpm dev` (= `nest start --watch`). The `start:dev` script mentioned in
  `README.md` does not exist. `pnpm start` / `pnpm start:prod` for one-shot and
  `node dist/main`.
- `pnpm build` (`nest build`, wipes `dist/`). `pnpm format` (prettier, `src` + `test`).
- Prisma (use `npx prisma`): `generate`, `migrate dev`, `migrate deploy`, `studio`.
- `pnpm test` — **no `*.spec.ts` exists anywhere**, so it exits non-zero with
  "no tests found". `pnpm test:e2e` only runs the stock Nest `test/app.e2e-spec.ts`,
  which asserts the default hello-world response and will fail against `AppController`
  returning a plain string only if that ever changes — it has never been run.
- `pnpm lint` — **broken**: `eslint.config.mjs` uses CommonJS `module.exports` plus the
  legacy `extends`/`plugins` keys, but ESLint 9 loads a `.mjs` config as ESM, so it
  throws before linting. `eslint-plugin-prettier` is wired through that config, so once
  fixed, prettier violations are lint errors.
- `pnpm prisma:seed` — **broken**: `prisma/seed.ts` does `import 'dotenv/config'` but
  `dotenv` is not a dependency and does not resolve. Add `dotenv` or drop the import
  (the app itself loads env through `@nestjs/config`).

## Environment

`.env` is gitignored and there is **no `.env.example`**. Required keys:
`DATABASE_URL` (PostgreSQL connection string), `JWT_SECRET`, `PORT` (default 3000).
`ConfigModule.forRoot` reads `.env.local` first, then `.env`.

## Architecture

- One folder per feature, always 4 files: `<name>.controller.ts`, `<name>.service.ts`,
  `<name>.dto.ts`, `<name>.module.ts`. Controllers are thin pass-throughs (parse params,
  forward to service); **all** Prisma access lives in services. Register new modules in
  `src/app.module.ts`.
- Prisma 7 uses the new `prisma-client` generator (not `prisma-client-js`): CJS output
  into `src/generated/prisma` (gitignored). Import from `../generated/prisma/client`,
  never from `@prisma/client` directly, and never edit generated files.
- `datasource db` in `schema.prisma` has **no `url`**; it comes from
  `prisma.config.ts` via `env('DATABASE_URL')`.
- `PrismaService` builds its own `PrismaPg` driver adapter and reads
  `process.env.DATABASE_URL`. It is listed in `AppModule` **and re-provided in every
  feature module** → one client/pool per module, and it is not `@Global`. Don't add
  further duplicates; making it global is the right fix.
- `JwtService` is likewise re-provided in every module. Import style is inconsistent
  (relative almost everywhere, `src/prisma/prisma.service` in `auth.module.ts`) because
  `tsconfig.baseUrl` is `./`. Prefer relative imports.
- Single migration `prisma/migrations/20260506130027_init` covers all 11 models. There
  has never been a second migration: any schema change needs `prisma migrate dev` and
  the generated SQL committed.

## Auth, tenancy and response shapes

- `src/auth/auth.guard.ts` is a hand-rolled guard, registered **twice**: as `APP_GUARD`
  in `app.module.ts` and again via `app.useGlobalGuards` in `main.ts`. Every request
  runs it twice.
- It calls `jwtService.decode()` — no signature verification — and checks `exp`
  manually. `src/auth/jwt.strategy.ts` (Passport, registered but unused) is the only
  place that would verify properly.
- Public routes are listed literally in `routesIgnores`: only `/api/auth/login`.
  `/api/auth/register` therefore **requires an existing valid token**.
- The JWT payload is `{ sub, email, role }` (see `auth.service.ts`) while
  `CurrentUserData` declares `userId` (`common/decorators/current-user.decorator.ts`),
  so the guard must expose the id as `userId` for `@CurrentUser() user.userId` to work.
  Every controller passes that value into its service.
- Scoping rule already in place: `patients`, `medical-histories` and `quotes` filter by
  `userId` (one clinic per `User`). `providers`, `customize`, `services-costs`,
  `payment-info` and the dolar rate are intentionally **global** (no `userId` column) —
  don't add a filter there by mistake, and don't forget one where it belongs.
- Response envelopes are inconsistent: CRUD returns `{ status, message, data }`; `auth`
  and the `/dolar` endpoints return `{ success, message, data }`; list endpoints return
  a bare array. `src/common/api-response.ts` and `src/common/base.dto.ts` define helpers
  that no service actually uses. For new endpoints follow the dominant
  `{ status, message, data }`.
- Deletes are soft (`isActive: false`) everywhere **except** `medical-histories`, which
  hard-deletes. Lists filter `isActive: true`; `update` in `patients`/`quotes` does not.

## Conventions

- Global prefix `/api`. Global `ValidationPipe` with `whitelist` **and**
  `forbidNonWhitelisted`: any request field not declared in the DTO returns HTTP 400
  `Errores de validación: ...`. Adding a client field means adding the DTO property
  first. (`UpdatePatientDto` is missing `lastName` and `identify`, so those cannot be
  changed through the API.)
- DTOs: class-validator with definite-assignment (`name!: string`), `@IsOptional()` for
  nullable fields, `@Type(() => X)` + `@ValidateNested({ each: true })` for nested
  objects. Services convert date strings explicitly (`new Date(dto.birthDate)`).
- Prisma `Decimal` columns (all prices, quote totals) serialize to **strings** in JSON
  responses; DTOs take them as `@IsNumber()`.
- `MedicalHistory.data` is a Prisma `Json` column holding the answers of the custom
  intake form — that is where filled-in form data lives.
- `createdAt`/`updatedAt` are DB defaults (`@default(now())` / `@updatedAt`); never set
  them by hand.
- Exceptions: throw Nest HTTP exceptions (`NotFoundException`, etc.) — the global
  `AllExceptionsFilter` turns anything else into a 500 `{ status: false, message }`.
  Messages are Spanish.
- Commits: Conventional Commits, single-line English subject
  (`feat: add JWT authentication and update services for dollar exchange rate`).
- Known route-ordering trap: in `customize.controller.ts`, `@Put(':id')` is declared
  before `@Put('reorder')`, so `PUT /api/customize/reorder` is captured by `:id` and
  the reorder endpoint is unreachable. Declare literal paths before `:param` routes.
