# AGENTS.md

NestJS 11 + Prisma 7 + PostgreSQL REST API for a medical clinic (patients, medical
histories, custom intake forms, providers, service pricing, quotes).

- Domain language is **Spanish** (entity names, validation/exception messages, seed
  data). Code, identifiers and commit messages are English.
- **Product spec: `docs/ESPECIFICACIONES.md`** — read it before adding or changing
  features; it records what each module does today and what is still missing.
- `preview/app.js` is a standalone static HTML/JS UI mock (mock data at the top of the
  file). Design reference only — it is not wired to this API.

## Package manager state: the pnpm migration is uncommitted

`package-lock.json` is deleted in the working tree, while `pnpm-lock.yaml` and
`pnpm-workspace.yaml` are **untracked** — the npm → pnpm move has never been committed.
So the local checkout uses pnpm, but a **fresh clone from `origin/main` is still an npm
project** (`npm ci`, `npm run …`). Don't assume the lockfile you see is the repo's.

If `pnpm-workspace.yaml`'s `allowBuilds` ever goes back to the literal placeholder
strings (`set this to true or false`), **every** `pnpm run`/`pnpm exec` aborts with
`ERR_PNPM_IGNORED_BUILDS` (prisma, @prisma/engines, @swc/core, bcrypt) before running
anything. Fix by setting all four values to `true` (or `pnpm approve-builds`); meanwhile
call the tools directly: `npx nest start`, `npx prisma migrate dev`, `npx jest`.

## Commands

- Dev watch: `pnpm dev` (= `nest start --watch`). The `start:dev` script mentioned in
  `README.md` does not exist.
- `pnpm build` (`nest build`, deletes `dist/`). `pnpm format` (prettier over `src`+`test`).
- Typecheck: `npx tsc -p tsconfig.json --noEmit --incremental false` (there is no script
  for it, and `--incremental` must be disabled or it writes a `.tsbuildinfo`).
- **`pnpm start:prod` is broken**: `tsconfig.build.json` sets no `include`/`rootDir`, so
  the root-level `prisma.config.ts` becomes the rootDir and the build emits
  `dist/src/main.js`, not `dist/main`. Run `node dist/src/main`.
- Prisma (use `npx prisma`): `generate`, `migrate dev`, `migrate deploy`, `studio`.
- `pnpm test` — **no `*.spec.ts` exists anywhere** (62 files checked, 0 matches), so it
  exits 1 with "No tests found". `pnpm test:e2e` only runs the stock Nest
  `test/app.e2e-spec.ts`, which was never executed. There are no test fixtures or
  in-memory-DB harness; the app talks to a real PostgreSQL.
- `pnpm lint` — **broken**: `eslint.config.mjs` uses CommonJS `module.exports` plus the
  legacy `extends`/`plugins` keys, but ESLint 9 loads a `.mjs` config as ESM and dies with
  `ReferenceError: module is not defined in ES module scope`. It also runs with `--fix`.
  `eslint-plugin-prettier` is wired through that config, so once fixed, prettier
  violations become lint errors.
- `pnpm prisma:seed` — runs, but **assumes the schema is already migrated**
  (`npx prisma migrate deploy` first; otherwise `TableDoesNotExist`). It is **not
  idempotent**: only `User` is `upsert`ed, every other insert is `create`, so a second
  run duplicates 10 patients, 15 providers, 75 provider services and 8 service costs.

## Environment

`.env` is gitignored and there is **no `.env.example`**. Required keys:
`DATABASE_URL` (PostgreSQL connection string), `JWT_SECRET`, `PORT` (default 3000).
`ConfigModule.forRoot` reads `.env.local` first, then `.env`.

The local `medclinical` database currently has **no tables** — the single migration has
never been applied to it, so every request that touches data returns HTTP 500.

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
  `process.env.DATABASE_URL` in its constructor. It is listed in `AppModule` **and
  re-provided in every feature module** → one client/pool per module, and it is not
  `@Global`. Don't add further duplicates; making it global is the right fix.
- `JwtService` is likewise re-provided in every module. Import style is inconsistent
  (relative almost everywhere, `src/prisma/prisma.service` in `auth.module.ts`) because
  `tsconfig.baseUrl` is `./`. Prefer relative imports.
- Single migration `prisma/migrations/20260506130027_init` covers all 11 models. There
  has never been a second migration: any schema change needs `npx prisma migrate dev`
  and the generated SQL committed.

## Auth, tenancy and response shapes

- `src/auth/auth.guard.ts` is a hand-rolled guard, registered **twice**: as `APP_GUARD`
  in `app.module.ts` and again via `app.useGlobalGuards` in `main.ts`. Every request
  runs it twice.
- It calls `jwtService.decode()` — **no signature verification** — and checks `exp`
  manually, so any well-formed JWT with a future `exp` is accepted. `src/auth/jwt.strategy.ts`
  (Passport) is registered but never wired to a guard; it is the only place that would
  verify properly.
- The JWT payload is `{ sub, email, role }` (`auth.service.ts`) but `CurrentUserData`
  declares `userId`. The guard maps `sub → userId` explicitly; **keep it that way** — it
  used to put the raw payload on the request, which made `user.userId` `undefined` in
  every controller and silently turned all tenant filters into no-ops. `@CurrentUser() user.userId`
  is the only supported way to read the caller's id.
- Public routes are listed literally in `routesIgnores`: only `/api/auth/login`.
  `/api/auth/register` therefore **requires an existing valid token**.
- Scoping rule: `patients`, `medical-histories` and `quotes` filter by `userId` (one
  clinic per `User`). `providers`, `customize`, `services-costs`, `payment-info` and the
  dolar rate are intentionally **global** (no `userId` column) — don't add a filter there
  by mistake, and don't forget one where it belongs.
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
  intake form — that is where filled-in form data lives. It is unvalidated free-form
  JSON, not tied to `CustomField`.
- `createdAt`/`updatedAt` are DB defaults (`@default(now())` / `@updatedAt`); never set
  them by hand.
- Exceptions: throw Nest HTTP exceptions (`NotFoundException`, etc.) — the global
  `AllExceptionsFilter` turns anything else into a 500 `{ status: false, message }`.
  Messages are Spanish.
- Commits: Conventional Commits, single-line English subject
  (`feat: add JWT authentication and update services for dollar exchange rate`).
- **Route-ordering trap, verified**: in `customize.controller.ts`, `@Put(':id')` is
  declared before `@Put('reorder')`, so `PUT /api/customize/reorder` is captured by
  `:id` and the reorder handler never runs (confirmed: the request reaches
  `customField.findUnique`). Declare literal paths before `:param` routes.
