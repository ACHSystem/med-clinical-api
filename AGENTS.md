# AGENTS.md

NestJS 11 + Prisma 7 + PostgreSQL REST API for a medical clinic (patients, medical
histories, custom intake forms, providers, service pricing, quotes).

- Domain language is **Spanish** (entity names, validation/exception messages, seed
  data). Code, identifiers and commit messages are English.
- **Product spec: `docs/ESPECIFICACIONES.md`** — read it before adding or changing
  features; it records what each module does today and what is still missing.
- **API reference: `docs/API.md`** — endpoint-by-endpoint contract for the frontend
  (payloads, response envelopes, form schemas, and the list of known defects). Update it
  whenever a route, DTO or response shape changes.
- **Appointments: `docs/ADR_CITAS.md`** (model, states, transitions, reschedule and overlap
  rules) and **`docs/CITAS_FRONTEND.md`** (frontend handoff). `AppointmentsModule` owns
  `/api/appointments`; the old `GET /medical-histories/appointments` routes are read-only
  aliases.
- **Antecedentes: `docs/ADR_ANTECEDENTES.md`** — opción híbrida, tipos, vigencia,
  duplicados, origen y qué muestra la ficha. `PatientConditionsModule` owns
  `/api/patients/:patientId/conditions` and `/clinical-summary`.
- **Permissions: `docs/PERMISOS.md`** — DOCTOR/ASSISTANT matrix and frontend handoff.
- **Operations: `docs/OPERACION.md`** — structured logs, request ID and metrics.
- **Data audit: `docs/AUDITORIA_DATOS.md`** — `AuditLog`, actions and sanitization.
- **Security audit: `docs/AUDITORIA.md`** — findings, the phases that were fixed, and
  what is still open.
- `preview/app.js` is a standalone static HTML/JS UI mock (mock data at the top of the
  file). Design reference only — it is not wired to this API.

## Package manager

The repo uses **pnpm** (`pnpm-lock.yaml`, `pnpm-workspace.yaml`, no `package-lock.json`).

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
- `pnpm start:prod` runs `node dist/main.js`; `nest build` currently emits `dist/main.js`.
- Prisma (use `npx prisma`): `generate`, `migrate dev`, `migrate deploy`, `studio`.
- `pnpm test` — runs focused unit specs (`roles.guard`, `exception.filter`,
  `services-costs.service`, `audit.service`). `pnpm test:e2e` only runs the stock Nest
  `test/app.e2e-spec.ts`, which was never executed. There are no test fixtures or
  in-memory-DB harness; the app talks to a real PostgreSQL.
- `pnpm lint` — **broken**: `eslint.config.mjs` uses CommonJS `module.exports` plus the
  legacy `extends`/`plugins` keys, but ESLint 9 loads a `.mjs` config as ESM and dies with
  `ReferenceError: module is not defined in ES module scope`. It also runs with `--fix`.
  `eslint-plugin-prettier` is wired through that config, so once fixed, prettier
  violations become lint errors.
- `pnpm prisma:seed` — **assumes the schema is already migrated** (`npx prisma migrate
  deploy` first). It is **idempotent**: every insert is guarded by `findFirst`/`upsert`,
  so a second run creates 0 rows. It always ensures the initial `DOCTOR` and the demo
  clinic exist.
## Environment

`.env` is gitignored; `.env.example` documents every key. `ConfigModule.forRoot` reads
`.env.local` first, then `.env`, and validates with Joi — a missing or malformed key
fails at boot instead of becoming a runtime 500.

| Key | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string. |
| `JWT_SECRET` | yes | Min. 32 chars. Read with `getOrThrow`, no fallback secret. |
| `CORS_ORIGINS` | yes | Comma-separated allow-list, e.g. `http://localhost:4200`. Never `*`. |
| `PORT` | no | Default 3000. |
| `DATABASE_POOL_MAX` | no | Default 10. Multiply by the number of server processes before raising it. |
| `DATABASE_POOL_CONNECT_TIMEOUT_MS` | no | Default 5000. |
| `DATABASE_POOL_IDLE_TIMEOUT_MS` | no | Default 30000. |
| `LOG_LEVEL` | no | `trace`/`debug`/`info`/`warn`/`error`/`fatal`. Default `info`. |
| `METRICS_TOKEN` | no | If absent, `GET /api/metrics` returns 404. Min. 16 chars. |

The frontend (`med-clinical`, Angular) serves on port 4200 — keep `CORS_ORIGINS` in sync
with it.

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
- `PrismaService` is provided **once**, by the `@Global()` `src/prisma/prisma.module.ts`
  using a `useFactory` with explicit `inject: [ConfigService]`. Do not re-provide it in a
  feature module — every duplicate is another connection pool. The factory configures
  `max`, `connectionTimeoutMillis` and `idleTimeoutMillis` from the `DATABASE_POOL_*`
  env vars; `onModuleInit` connects eagerly and `onModuleDestroy` disconnects
  (`enableShutdownHooks()` in `main.ts`).
  The `inject: [...]` array is required: a `useFactory` in a plain object literal gets no
  emitted design:paramtypes, so a bare `useFactory: (config: ConfigService) => …` resolves
  `config` as `undefined` and crashes at boot.
- `JwtService` is re-provided in `auth.module.ts` and `providers.module.ts`. Import style
  is inconsistent (relative almost everywhere, `src/prisma/prisma.service` in
  `auth.module.ts`) because `tsconfig.baseUrl` is `./`. Prefer relative imports.
- The initial migration `prisma/migrations/20260506130027_init` covered the original
  models; later migrations add clinics/templates, audits/signatures, dollar normalization
  and quote versioning. Any schema change needs a new migration
  (`npx prisma migrate dev --name ...`) and the generated SQL committed.
- Quotes are versioned: `QuoteStatus` (`DRAFT|SENT|APPROVED|REJECTED|EXPIRED|CANCELLED`),
  `version`, `rootQuoteId`, `supersedesId`, `supersededAt`, currency/tax snapshots and
  server-computed totals. Only `DRAFT` is editable; issued versions are immutable and
  `POST /quotes/:id/revise` creates the next version. See `docs/QUOTES_FRONTEND.md`.

## Auth, tenancy and response shapes

- `src/auth/auth.guard.ts` is a hand-rolled guard, registered exactly once as `APP_GUARD`
  in `app.module.ts`. **Do not also add it via `app.useGlobalGuards` in `main.ts`** — that
  made every request run the whole guard (and the limiter) twice.
- It calls `jwtService.verify(token, { algorithms: ['HS256'] })` and reads `JWT_SECRET`
  via `getOrThrow`, so a token signed with any other secret is rejected. Do not "optimise"
  this back to `decode()`. `src/auth/jwt.strategy.ts` (Passport) is still registered but
  never wired to a guard, and it is no longer needed as the only verifying path.
- The JWT payload is `{ sub, email, role }` (`auth.service.ts`) but `CurrentUserData`
  declares `userId`. The guard maps `sub → userId` explicitly; **keep it that way** — it
  used to put the raw payload on the request, which made `user.userId` `undefined` in
  every controller and silently turned all tenant filters into no-ops. `@CurrentUser() user.userId`
  is the only supported way to read the caller's id.
- Public routes are listed literally in `routesIgnores`: `/api/auth/login` and
  `/api/metrics`. `/api/auth/register` **requires a DOCTOR token** (the first `DOCTOR`
  comes from the seed) and creates `ASSISTANT` users.
- `RolesGuard` is registered after `AuthGuard`; it reads `request.user.role` (the
  membership role) and enforces `@Roles(Role.DOCTOR)` on sensitive endpoints.
- Rate limiting: `ThrottlerModule` defines a **single** throttler named `short`
  (100/min). Login and register override it with `@Throttle({ short: { limit: 5 } })` and
  `POST /services-costs/dolar/save` with `limit: 1`. Declaring extra *named* throttlers is
  a trap: `ThrottlerGuard` runs every configured throttler on every route, so a strict
  `auth` throttler silently caps the whole API at 5 requests/minute. The storage is
  in-memory, so limits reset on restart and are not shared between instances.
- `main.ts` applies Helmet, a strict `CORS_ORIGINS` allow-list (no `*`), `trust proxy`
  for correct client IPs behind a reverse proxy, and `enableShutdownHooks()`.
- Scoping rule: `patients`, `medical-histories`, `quotes`, `providers`, `customize`,
  `services-costs` and `payment-info` filter by `clinicId` on reads and writes. The
  creates re-check that the referenced patient/provider belongs to the clinic. `Dolar` is
  intentionally global.
- Response contract (enforced by review): writes `{ status, message, data }`; detail GETs
  `{ data }`; list GETs `{ data, pagination }`; errors
  `{ status: false, message, code, requestId }`. Use `src/common/api-response.ts`
  (`writeResponse`, `detailResponse`) and `toPaginatedResult`; do not reintroduce
  `success` or bare objects. `src/common/base.dto.ts` was removed.
- Deletes are soft (`isActive: false` for patients/providers/costs/payments/quotes,
  `deleted: true` for medical histories). Lists filter the soft-delete flag. `GET` by id
  hides inactive/deleted records by default; `PUT`/`DELETE` on an already inactive/deleted
  record returns `404`. Patients can be reactivated with `PUT {isActive:true}`; quotes can
  be reactivated the same way.

## Conventions

- Global prefix `/api`. Global `ValidationPipe` with `whitelist` **and**
  `forbidNonWhitelisted`: any request field not declared in the DTO returns HTTP 400
  `Errores de validación: ...`. Adding a client field means adding the DTO property
  first. `PUT /patients/:id` uses `UpdatePatientDto` (partial) and accepts `isActive:true`
  to reactivate. `Patient.identify` and `Provider.identify` are unique per clinic, not
  globally.
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
  `AllExceptionsFilter` turns anything else into a 500
  `{ status: false, message, code, requestId }`. Messages are Spanish.
- Commits: Conventional Commits, single-line English subject
  (`feat: add JWT authentication and update services for dollar exchange rate`).
- **Route-ordering rule**: declare literal paths before `:param` routes. The previous
  `customize` trap (`@Put(':id')` before `@Put('reorder')`) was fixed by moving
  `@Put('reorder')` above `@Put(':id')`.
