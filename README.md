<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://img.shields.io/badge/Backers-Open%20Collective-41B883.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://img.shields.io/badge/Sponsors-Open%20Collective-orange.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>

# med-clinical-api

API REST para la gestión de **historias clínicas y nutrición** de consultorios médicos.
Permite registrar pacientes, llevar su historial de consultas con formularios clínicos
dinámicos, gestionar citas y tratamientos con medicación, mantener una agenda de
proveedores externos, una lista de precios propia y emitir presupuestos en bolívares con
la cotización del dólar congelada.

Construida con **NestJS 11 + Prisma 7 + PostgreSQL**, con arquitectura **multi-consultorio
(multi-tenant)** y autenticación JWT.

---

## 1. El problema

Los consultorios pequeños suelen llevar la historia clínica en papel o en hojas de cálculo
sueltas. Esto genera varios problemas concretos que el sistema busca resolver:

- **Historial disperso y no consultable.** Los antecedentes de un paciente quedan
  repartidos entre fichas y agendas; no hay una vista cronológica única por paciente ni
  forma de buscar por diagnóstico, condición o fecha.
- **Formularios clínicos variables.** Cada condición (hipertensión, problemas gástricos,
  control nutricional, etc.) necesita un conjunto de preguntas distinto. Un formulario fijo
  no sirve; se necesita un **constructor de plantillas** reutilizables por condición.
- **Seguimiento de citas y tratamientos.** Registrar una consulta no basta: hay que saber
  si el paciente asistió, cuándo es la próxima cita y qué tratamiento/medicación se indicó.
- **Datos compartidos entre varios consultorios.** Un mismo médico puede trabajar en más
  de un consultorio, y dos profesionales pueden compartir uno. Los datos de negocio deben
  aislarse por consultorio, pero la identidad del usuario no debe duplicarse.
- **Presupuestos atados al dólar.** El precio de los servicios se maneja en bolívares pero
  se referencia al dólar. Un presupuesto ya emitido **no debe cambiar** cuando la tasa se
  actualiza días después.
- **Seguridad.** Al exponer la API a la red, cada consultorio debe poder ver **solo** sus
  pacientes, y el token no puede ser falsificable.

## 2. La solución

Se construyó una **API REST multi-tenant** que modela el negocio real:

- **Aislamiento por consultorio (tenant).** `Clinic` es el tenant y todos los datos de
  negocio cuelgan de él; `User` es solo la identidad de la persona y `ClinicUser` es la
  membresía que une ambos con un rol (un usuario puede pertenecer a varios consultorios).
  El JWT lleva el **consultorio activo** (`clinicId`) y cada petición vuelve a verificar la
  membresía contra la base de datos antes de tocar ningún dato.
- **Formularios dinámicos.** `FormTemplate` agrupa `CustomField`s por condición clínica.
  Cada `MedicalHistory` guarda las respuestas en un campo JSON (`data`) y un
  `templateSnapshot` con la definición de la plantilla **en el momento del guardado**, de
  modo que la historia sigue siendo interpretable aunque la plantilla cambie o se desactive.
- **Citas y tratamientos.** `Appointment` modela la agenda (fecha/hora, tipo, estado,
  confirmación/asistencia) y se enlaza 1:1 con la historia; `MedicalTreatments` +
  `TreatmentMedication` + catálogo `Medication` registran el plan y la indicación concreta de
  cada fármaco.
- **Presupuestos con snapshot de dólar.** `Quote` referencia una fila de `Dolar` capturada
  al emitirse, por lo que actualizar la tasa no altera presupuestos pasados. Los totales por
  línea se calculan en el servidor.
- **Endurecimiento de seguridad.** Firma JWT verificada, guards globales, rate limiting,
  CORS por allow-list, validación de entorno al arranque, un único pool de conexiones y
  cierre ordenado (ver `docs/AUDITORIA.md`).
- **Permisos por membresía.** `RolesGuard` aplica la matriz DOCTOR/ASSISTANT en endpoints
  sensibles (ver `docs/PERMISOS.md`).
- **Auditoría y firma.** `AuditLog` registra altas, ediciones, bajas y firmas; las historias
  guardan `signedAt`/`signedById` (ver `docs/AUDITORIA_DATOS.md`).
- **Observabilidad.** Logs JSON con `pino`, request ID y métricas Prometheus en
  `/api/metrics` (ver `docs/OPERACION.md`).

## 3. Tecnologías utilizadas

| Categoría | Tecnología | Uso en el proyecto |
| --- | --- | --- |
| Lenguaje | **TypeScript 5** | Todo el código. |
| Framework | **NestJS 11** | Módulos, DI, guards, pipes, filtros. |
| ORM | **Prisma 7** (generador `prisma-client`, `@prisma/adapter-pg`) | Acceso tipado a datos. |
| Base de datos | **PostgreSQL** | Persistencia (driver `pg`). |
| Autenticación | **JWT** (`@nestjs/jwt` + `jsonwebtoken`) | Tokens HS256 con `clinicId`; expiran a 7 días. |
| Hash de contraseñas | **bcrypt** | Contraseñas nunca en claro. |
| Validación | **class-validator** / **class-transformer** | DTOs y `ValidationPipe` estricto. |
| Validación de entorno | **Joi** | Falla en el arranque si falta o es inválida una variable. |
| Seguridad HTTP | **Helmet** | Cabeceras de seguridad. |
| Rate limiting | **@nestjs/throttler** | 100/min global, 5/min en auth, 1/min en la llamada al dólar. |
| HTTP saliente | **axios** | Cotización del dólar (`ve.dolarapi.com`). |
| Gestor de paquetes | **pnpm** | `pnpm-lock.yaml` + workspace. |
| Contenedores | **Docker** (multi-stage) | Build y runtime reproducibles. |
| Pruebas | **Jest** / supertest | 4 suites unitarias focalizadas (guards, filtro, dólar y auditoría). |

## 4. Arquitectura

### 4.1 Estructura

Un directorio por feature con 4 archivos:

```
src/
  auth/               # login, register, perfil y cambio de consultorio
  patients/
  medical-histories/  # historias, citas y tratamientos anidados
  customize/          # plantillas y campos del formulario dinámico
  providers/          # proveedores externos y sus servicios
  services-costs/     # lista de precios + tasa del dólar
  quotes/             # presupuestos
  payment/            # métodos de pago
  prisma/             # PrismaModule global y PrismaService (pool único)
  common/             # decoradores, paginación, helpers
  filters/            # AllExceptionsFilter
```

Cada módulo sigue `<name>.controller.ts` / `.service.ts` / `.dto.ts` / `.module.ts`.
Los controladores son finos (parsean y delegan); **todo** el acceso a Prisma vive en los
servicios.

### 4.2 Modelo de tenancy

```
User (identidad)  ──< ClinicUser >──  Clinic (tenant)
   │                                     │
   │ crea                                └── Patient, MedicalHistory, Quote,
   └── MedicalHistory / Quote                 FormTemplate, Provider, ServiceCost,
                                              PaymentMethod, Medication, Appointment
```

- `Dolar` es **global** a propósito (es una cotización pública, no dato de un consultorio).
- `ClinicUser` guarda el **rol dentro del consultorio** (`DOCTOR` / `ASSISTANT`).

### 4.3 Flujo de una petición

1. `requestContextMiddleware` asigna/propaga `requestId` y datos de la petición.
2. `ThrottlerGuard` (global) limita por IP.
3. `AuthGuard` (global) verifica la firma HS256, exige `clinicId`, y **revalida la
   membresía** contra la base de datos; inyecta `user` (`userId`, `clinicId`, `role`).
4. `RolesGuard` (global) aplica `@Roles(...)` cuando el endpoint lo declara.
5. `ValidationPipe` global (con `whitelist` y `forbidNonWhitelisted`) valida el DTO.
6. El servicio aplica el filtro por `clinicId`, escribe auditoría y habla con Prisma.
7. `AllExceptionsFilter` normaliza los errores a
   `{ status: false, message, code, requestId }`.

> Las rutas sin JWT son `POST /api/auth/login` y `GET /api/metrics` (esta última exige
> `x-metrics-token`). `/auth/register` exige un token DOCTOR; el primer `DOCTOR` viene del
> seed.

## 5. Estrategias utilizadas

### 5.1 Multi-tenancy por consultorio
`clinicId` viaja en el token y **no** se confía en el cuerpo de la petición. Lecturas y
escrituras filtran por la clínica activa; acceder a un recurso ajeno devuelve `404` (nunca
`403`, para no revelar que existe). Los `create` re-verifican que el paciente referenciado
pertenece a la clínica. Expulsar a un miembro surte efecto de inmediato porque la membresía
se revisa en cada petición, no solo en el login.

### 5.2 Formularios dinámicos con snapshot
`FormTemplate` + `CustomField` (tipo libre, `options`, `step`, `sortOrder`, validaciones).
Al guardar una historia se copia la definición de la plantilla en `templateSnapshot` y las
respuestas en `data`. Así una plantilla puede evolucionar sin romper el historial ya
registrado.

### 5.3 Integridad del presupuesto y del dólar
- Los totales de cada `QuoteItem` los calcula el servidor (`unitPrice × quantity`).
- `Quote.dolarId` congela la tasa vigente al emitir el presupuesto.
- El histórico de `Dolar` es *append-only* y se alimenta desde la API externa.

### 5.4 Seguridad (resumen de `docs/AUDITORIA.md`)
- **F-01** verificación real de la firma del JWT (antes se usaba `decode()`, un bypass total).
- **F-02/F-03** cierre de IDOR en la creación de historias y presupuestos.
- **F-04** rate limiting; **F-05** Helmet; **F-11** CORS por allow-list.
- **F-06** un único `PrismaModule` global (antes 9 pools → hasta 90 conexiones).
- **F-07/F-08** credenciales fuera del código; **F-09** validación de entorno con Joi;
  **F-10** cierre ordenado; **F-12** guard registrado una sola vez; **F-13** error de login
  uniforme para no enumerar cuentas.
- **Autorización por rol** con `RolesGuard`; **auditoría** de datos clínicos/comerciales;
  **logs estructurados** con request ID y **métricas** de latencia/errores.

### 5.5 Persistencia y calidad de datos
- Borrado lógico donde aplica (`deleted`/`isActive`); las listas excluyen lo borrado.
  Los pacientes y presupuestos se pueden reactivar con `PUT {isActive:true}`.
- Cédula/identificación única **por clínica** para pacientes y proveedores; la misma
  identificación puede existir en consultorios distintos.
- `POST /auth/register` es transaccional, exige DOCTOR de la clínica destino, email único
  y contraseña de 8+ caracteres con letra y número.
- Paginación y filtros (`page`, `limit`, `search`, fechas) en los listados.
- `createdAt`/`updatedAt` gestionados por la base de datos.
- Migraciones versionadas (`prisma/migrations`); **seed idempotente** que no duplica datos.
- Contrato único de respuestas: escrituras `{ status, message, data }`, detalles `{ data }`,
  listas `{ data, pagination }` y errores `{ status:false, message, code, requestId }`.

## 6. Modelo de datos (resumen)

| Modelo | Descripción |
| --- | --- |
| `User` | Identidad de la persona (email, username, contraseña, rol). No es el tenant. |
| `Clinic` | El consultorio: tenant del negocio. |
| `ClinicUser` | Membresía usuario↔consultorio con rol. |
| `Patient` | Paciente de un consultorio. |
| `MedicalHistory` | Consulta: motivo, síntomas, diagnóstico, signos vitales, respuestas JSON y snapshot de plantilla. |
| `FormTemplate` / `CustomField` | Plantillas de formulario por condición y sus campos. |
| `Appointment` | Cita: fecha/hora, tipo, estado, confirmación/asistencia, enlace 1:1 con la historia. |
| `MedicalTreatments` | Plan de tratamiento (no farmacológico) de una historia. |
| `Medication` / `TreatmentMedication` | Catálogo de medicamentos y la indicación concreta por tratamiento. |
| `Provider` / `ProviderService` | Proveedores externos y su catálogo de servicios. |
| `ServiceCost` | Lista de precios propia del consultorio. |
| `PaymentMethod` | Datos bancarios para pago. |
| `Dolar` | Histórico global de la tasa USD (una fila por día calendario UTC + valor). |
| `Quote` / `QuoteItem` | Presupuesto y sus líneas, con snapshot del dólar. |
| `AuditLog` | Registro inmutable de quién creó, editó, borró o firmó datos clínicos/comerciales. |

## 7. Endpoints principales

Prefijo global `/api`; todas las rutas requieren `Authorization: Bearer <token>` salvo
`POST /api/auth/login` y `GET /api/metrics` (con `x-metrics-token`).

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/auth/login` | Login (por `username`). Público. |
| `POST` | `/auth/register` | Alta de asistente (requiere token DOCTOR). |
| `GET` | `/auth/profile` | Usuario y consultorio activo. |
| `GET` | `/auth/clinics` | Consultorios del usuario. |
| `POST` | `/auth/switch-clinic` | Cambia el consultorio activo y emite token nuevo. |
| `GET/POST/PUT/DELETE` | `/patients` | CRUD de pacientes (por consultorio, paginado). |
| `GET` | `/patients/:id/medical-histories` | Historial completo de un paciente. |
| `GET/POST/PUT/DELETE` | `/medical-histories` | Historias médicas (con tratamientos y cita). |
| `GET` | `/medical-histories/appointments` | Agenda de citas del consultorio. |
| `GET/POST/PUT/DELETE` | `/customize/templates`, `/customize/fields` | Plantillas y campos del formulario dinámico (incluye `reorder`). |
| `GET/POST/PUT/DELETE` | `/quotes` | Presupuestos. |
| `GET/POST/PUT/DELETE` | `/providers` | Proveedores y sus servicios. |
| `GET/POST/PUT/DELETE` | `/services-costs` | Lista de precios. |
| `GET` | `/services-costs/dolar` | Última tasa (404 si no hay). |
| `POST` | `/services-costs/dolar` | Guardar una tasa manual. |
| `POST` | `/services-costs/dolar/save` | Captura automática (1/min). |
| `GET/POST/PUT/DELETE` | `/payment-info` | Métodos de pago. |
| `GET` | `/audit-logs` | Auditoría (solo DOCTOR). |
| `GET` | `/metrics` | Métricas Prometheus (`x-metrics-token`). |

El contrato detallado (payloads, envolturas, tipos y defectos conocidos) está en
[`docs/API.md`](docs/API.md).

## 8. Puesta en marcha

Requisitos: Node.js 22+, `pnpm` y un PostgreSQL accesible.

```bash
# 1. Dependencias
pnpm install

# 2. Variables de entorno
cp .env.example .env      # y completar DATABASE_URL, JWT_SECRET y CORS_ORIGINS

# 3. Esquema y datos de ejemplo
npx prisma migrate deploy
pnpm prisma:seed

# 4. Desarrollo (watch)
pnpm dev
```

Credenciales del seed (solo desarrollo): usuario `admin`, contraseña `admin`
(doctora `doctor@medclinical.com`, asistente `assistant@medclinical.com`).

El seed es **idempotente**: se puede ejecutar varias veces sin duplicar pacientes,
proveedores, servicios, costos, historias, presupuestos ni tasas del dólar. Siempre
crea/actualiza el `DOCTOR` inicial y la clínica demo `Consultorio Principal`.

### Docker

```bash
docker build -t med-clinical-api .
docker run --env-file .env -p 3008:3008 med-clinical-api
```

### Comandos útiles

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Nest en modo watch. |
| `pnpm build` | Compila a `dist/`. |
| `npx tsc -p tsconfig.json --noEmit --incremental false` | Typecheck. |
| `npx prisma migrate dev` | Nueva migración en desarrollo. |
| `pnpm prisma:seed` | Siembra datos (idempotente). |
| `pnpm format` | Prettier sobre `src` y `test`. |

Variables de entorno (validadas con Joi al arrancar): `DATABASE_URL`, `JWT_SECRET`
(mín. 32 caracteres), `CORS_ORIGINS`, `PORT`, los `DATABASE_POOL_*`, `LOG_LEVEL` y
`METRICS_TOKEN` (opcional; sin ella `/api/metrics` responde 404).

## 9. Estado y trabajo pendiente

Ya implementado y verificado: F-01…F-13 del audit, paginación/filtros, multi-consultorio,
plantillas de formulario, citas, tratamientos/medicación y snapshot del dólar.

Pendiente / abierto:

- **Credencial en el historial de git** (`docs/AUDITORIA.md` O-01): rotar la contraseña.
- **Frontend**: ocultar acciones por rol en `med-clinical` según `docs/PERMISOS.md`.
- `Quote.status` es texto libre sin reglas de transición; no hay PDF/descarga de presupuestos.
- `Provider`/`ProviderService` aún no se enlazan a `Quote`/`MedicalHistory`.
- La purga/retención de `AuditLog` es una decisión operativa pendiente.

Los requisitos de producto y las brechas están en
[`docs/ESPECIFICACIONES.md`](docs/ESPECIFICACIONES.md); los hallazgos de seguridad, en
[`docs/AUDITORIA.md`](docs/AUDITORIA.md).

## 10. Documentación

| Documento | Contenido |
| --- | --- |
| [`docs/API.md`](docs/API.md) | Contrato endpoint por endpoint para el frontend. |
| [`docs/PERMISOS.md`](docs/PERMISOS.md) | Matriz de permisos DOCTOR/ASSISTANT y handoff de UI. |
| [`docs/OPERACION.md`](docs/OPERACION.md) | Logs, request ID, métricas y alertas. |
| [`docs/AUDITORIA_DATOS.md`](docs/AUDITORIA_DATOS.md) | Tabla de auditoría, acciones y sanitización. |
| [`docs/ESPECIFICACIONES.md`](docs/ESPECIFICACIONES.md) | Especificación de producto: qué existe y qué falta. |
| [`docs/AUDITORIA.md`](docs/AUDITORIA.md) | Auditoría de seguridad y hallazgos. |
| [`AGENTS.md`](AGENTS.md) | Guía de ingeniería: comandos y convenciones. |

## Licencia

Proyecto privado (`UNLICENSED`). El framework base NestJS es
[MIT](https://github.com/nestjs/nest/blob/master/LICENSE).
