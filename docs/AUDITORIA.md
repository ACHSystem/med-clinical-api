# Security & performance audit

Date: 2026-09-29 · Scope: `med-clinical-api` (NestJS 11 + Prisma 7 + PostgreSQL) ·
Reviewed: `src/**`, `prisma/schema.prisma`, the single migration, `prisma/seed.ts`,
`main.ts` bootstrap and the runtime behaviour of the API.

Status legend: **Fixed** = implemented and verified against a running instance ·
**Open** = documented, deliberately not implemented in this pass.

## Verdict

The API was not safe to expose to a network. The authentication guard accepted any
well-formed JWT without checking its signature, which is a complete authentication
bypass: anybody could mint a token for an arbitrary `userId` and read or write another
clinic's data. Two secondary cross-tenant write holes existed on top of that. The
bootstrap also opened 9 separate database connection pools and applied no security
headers, no rate limiting and no environment validation.

Phases 0–2 of the remediation plan are implemented and verified. 13 findings are fixed;
7 remain open, of which the most urgent is an operational one (a database password that
was committed to git) and the most expensive is the absence of any automated test.

## Findings fixed in this pass

| ID | Sev | Finding | Fix |
| --- | --- | --- | --- |
| F-01 | Critical | JWT signature never verified | `jwtService.verify(token, { algorithms: ['HS256'] })` |
| F-02 | High | IDOR: cross-tenant write on medical histories | Ownership re-check in `create()` |
| F-03 | High | IDOR: cross-tenant write on quotes | Ownership re-check in `create()` |
| F-04 | High | No rate limiting anywhere | `@nestjs/throttler`, 5/min on auth, 1/min on the external-API call |
| F-05 | High | No security headers | `helmet()` in `main.ts` |
| F-06 | High | 9 connection pools (9 × 10 = 90 connections) | One `@Global()` `PrismaModule` |
| F-07 | Medium | Hardcoded DB password in `prisma/seed.ts` | `getOrThrow('DATABASE_URL')`; rotation still required (see below) |
| F-08 | Medium | Hardcoded JWT secret fallback in `jwt.strategy.ts` | Removed |
| F-09 | Medium | No environment validation at boot | Joi schema in `ConfigModule.forRoot` |
| F-10 | Medium | No graceful shutdown; connections leak on restart | `enableShutdownHooks()` + `onModuleDestroy` |
| F-11 | Medium | CORS not driven by an allow-list | `CORS_ORIGINS` env, never `*` |
| F-12 | Low | Auth guard registered twice, every request ran twice | Removed the `useGlobalGuards` duplicate |
| F-13 | Low | Login errors distinguished "no such user" from "wrong password" | Uniform `Credenciales inválidas` |

### F-01 — JWT signature never verified (Critical)

`AuthGuard` called `jwtService.decode()` and compared `exp` by hand. `decode()` performs
no cryptographic check, so a token with a valid shape and a future `exp` was accepted
regardless of who signed it. Combined with the `sub → userId` mapping, an attacker could
issue `{"sub":"<any-user-id>","role":"DOCTOR"}` and act as any clinic.

`jwtService.verify(token, { algorithms: ['HS256'] })` now runs against `JWT_SECRET`
read with `getOrThrow`, so a missing secret fails at boot instead of silently accepting
`undefined`, and the explicit `algorithms` list blocks `alg: none` / algorithm
confusion. A token signed with a different secret now returns
`401 Token inválido o expirado` (it previously returned `200` with another clinic's
records).

### F-02 / F-03 — Cross-tenant writes (High)

Reads in `medical-histories` and `quotes` filtered by `userId`, but their `create()`
methods never checked that the referenced `patientId` belonged to the caller. A doctor
could therefore open a history or a quote on any patient id in the database, attaching
their data to another clinic. Both services now resolve the patient through the same
`userId` filter and return `404 Paciente no encontrado` when it does not match, which
also avoids confirming that the id exists.

### F-04 — No rate limiting (High)

`POST /api/auth/login` was an unthrottled password oracle, and the dollar capture
performs an outbound HTTP call and a write on every request, so it was usable both as a
DoS amplifier and as a way to hammer the external rate provider. The write route is now
`POST /api/services-costs/dolar/save` (the old `GET` was removed). Limits are 5/min on
login and register, 1/min on the dollar save, 100/min globally.

Note the implementation trap: `ThrottlerGuard` runs **every** configured throttler on
**every** route. An earlier attempt declared three named throttlers (`short`, `auth`,
`dolar`) and that capped the entire API at 5 requests/minute, because the `auth` limit
was applied to `/patients` too. The module now declares a single throttler named `short`
and the sensitive routes override *that* limiter with `@Throttle({ short: … })`.

Limitations: the storage is in-memory, so limits reset on restart, are per-process, and
are not shared between instances. A multi-instance deployment needs the Redis storage
adapter. There is also no lockout or alerting on repeated failures.

### F-05 / F-11 — Headers and CORS (High / Medium)

No security headers were set, so responses lacked `X-Frame-Options`,
`X-Content-Type-Options` and HSTS, and the CORS behaviour depended on the framework
default rather than on an explicit allow-list. `helmet()` is now applied globally and
`app.enableCors()` uses an explicit `CORS_ORIGINS` list (the Angular frontend on
`http://localhost:4200`) with `credentials: true`. A wildcard is not accepted.

### F-06 — Nine connection pools (High)

`PrismaService` was provided by `AppModule` **and** re-provided by all eight feature
modules. Each instance builds its own driver adapter and pool, so the process could open
up to 90 connections and multiply that by the number of instances in a cluster; under
load this exhausts `max_connections` before the application is saturated. A single
`@Global()` `PrismaModule` now provides it, with `max`, `connectionTimeoutMillis` and
`idleTimeoutMillis` configurable via `DATABASE_POOL_*`. Measured: 6 module endpoints →
1 connection, down from one pool per module.

### F-07 — Committed database credential (Medium, operational action outstanding)

`prisma/seed.ts` contained a fallback `DATABASE_URL` with a real password, and it is in
git history (commit `6820471`). Removing it from the file does **not** remove it from
history, so the credential must be treated as compromised: the role's password has to be
rotated, and if the same password was reused on other environments those change too. The
user has taken responsibility for running the rotation; the `ALTER ROLE … PASSWORD`
statements were provided for both the owner and the application role.

Recommendation beyond rotation: `git filter-repo` to purge the secret from history if
the repository is shared, and a secret manager (or at minimum an untracked `.env.local`)
for deployments.

### F-09 — No environment validation (Medium)

A missing or malformed variable surfaced as a runtime 500, or worse, as a silently
degraded value. `ConfigModule.forRoot` now validates with Joi: `DATABASE_URL` (required,
must be a URL), `JWT_SECRET` (required, min. 32 characters), `CORS_ORIGINS` (required,
non-empty, no `*`) and the pool settings (optional, positive integers, with defaults).
`.env.example` documents every key.

## Open findings

| ID | Sev | Finding | Impact |
| --- | --- | --- | --- |
| O-01 | Critical | Database credential in git history (code fixed, secret not rotated) | Full data access if the password is reused |
| O-02 | High | No automated tests at all | No regression safety net; a fix like F-01 can silently revert |
| O-03 | Medium | No index except `User_email_key` | Every FK lookup and every list endpoint is a sequential scan |
| O-04 | Medium | All 7 FKs are `ON DELETE RESTRICT` | Deleting a user or provider with data fails with a raw FK error |
| O-05 | Medium | No pagination on any list endpoint | Full table returned and fully materialised in memory |
| O-06 | Low | `Patient.identify` is not unique | Duplicate identification numbers allowed |
| O-07 | Low | Dead Passport strategy still registered | Two sources of truth for auth; a maintenance trap |

### O-03 — Missing indexes (schema, not implemented)

The schema declares no `@@index` and the migration creates exactly one index. The hot
paths are the tenant filters and joins: `Patient.userId`, `MedicalHistory.patientId`,
`MedicalHistory.userId`, `Quote.patientId`, `Quote.userId`, `QuoteItem.quoteId` and
`ProviderService.providerId`, plus `isActive` filters on the list endpoints. Every one
of those is a sequential scan today; it is invisible with 10 seeded rows and painful at
10⁵. This needs `npx prisma migrate dev` and the generated SQL committed, which was
explicitly out of scope for this pass.

### O-04 — Referential actions (schema, not implemented)

Prisma defaults required relations to `RESTRICT`, so the migration emits
`ON DELETE RESTRICT` for all 7 foreign keys. Deleting a `User` that owns patients, or a
`Provider` that has services, fails with a Prisma error rather than cascading or
nulling. Since all deletes are soft (`isActive: false` or `deleted: true` for medical
histories), this is latent rather than an active bug, but it
becomes one as soon as a purge or a "delete clinic" feature exists. Decide per relation
(`Cascade` for `QuoteItem` → `Quote`, `Restrict` or `SetNull` elsewhere) before adding
the endpoint.

## Verification

Against a running instance with the schema migrated and seeded:

- `npx tsc -p tsconfig.json --noEmit --incremental false` — clean
- `npx nest build` — clean
- 15/15 scripted security checks pass: forged token → 401, uniform login error,
  self-registration blocked without a token, read isolation, IDOR blocked on both
  histories and quotes, positive control on own data, 429 after 5 failed logins,
  no exception class name in error bodies, Helmet headers present, unknown `Origin` not
  reflected, allowed origin echoed.
- Connection count in `pg_stat_activity`: 1 with six module endpoints exercised, 0 after
  shutdown.
- The throttler cap on the whole API (regression found and fixed during verification) is
  covered by the 100/min global limit still being in effect on non-auth routes.

Not verified: graceful shutdown was exercised by terminating the process, not by
sending SIGINT/SIGTERM, so the `onModuleDestroy` path is verified only as wired code on
Windows.

## Deliberately not changed

- The tenant model. `Provider`, `CustomField`, `ServiceCost` and `PaymentMethod` are
  global by design for a single-clinic deployment; the choice was confirmed as intended.
  Adding `userId` to them is a product decision, not a security fix.
- `/api/auth/register` stays behind the guard. Making it public would turn it into an
  open registration endpoint; the first `DOCTOR` account comes from the seed.
- Schema changes, pagination, structured logging, seed idempotency, a repaired ESLint
  config and an in-memory test harness were all left out of this pass and are listed
  above or in `AGENTS.md`.
