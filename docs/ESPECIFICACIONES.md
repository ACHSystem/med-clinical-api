# Especificaciones — med-clinical-api

Product specification for the medical-clinic API. It is written in English for tooling
readability, but the **domain vocabulary is Spanish** and the terms used by the UI and
the API payloads are the ones in `backticks`.

This file has two jobs:

1. **What exists today** — the domain as it is actually implemented (tables + routes).
2. **What is specified but missing** — the requirements the system is supposed to cover
   and the schema work each one implies.

`AGENTS.md` (repo root) covers the engineering side: commands, wiring, conventions.

---

## 1. Purpose and actors

A record-keeping system for doctors and medical specialists. A clinic registers
patients, tracks every consultation over time, keeps a structured per-condition
questionnaire library, manages the external providers it refers patients to, prices its
own services, and issues itemised quotes (presupuestos) to patients.

| Actor | Role (`User.role`) | What they do |
| --- | --- | --- |
| Doctor | `DOCTOR` | Owns a clinic. Everything below is scoped to them. |
| Assistant | `ASSISTANT` | Front-desk user: reads everything, writes patients and quotes; clinical histories, templates, providers, costs, payments, dollar and deletions are DOCTOR-only. |

`Patient`, `MedicalHistory`, `Quote`, `ServiceCost`, `Provider`, `PaymentMethod` and the
customize module belong to a clinic and are filtered by the active clinic on reads and
writes. `Dolar` is global.

There is no email verification and no password reset. Role-based permissions are enforced
by `RolesGuard` (see `docs/PERMISOS.md`) and every clinical/commercial mutation is recorded
in `AuditLog` (see `docs/AUDITORIA_DATOS.md`).

---

## 2. Implemented domain

### 2.1 Patients — `Patient`

Registered once, then referenced by every history and quote.

| Spec requirement | Column | Notes |
| --- | --- | --- |
| Nombre completo | `name`, `lastName` | Split, not a single full name. |
| Cédula | `identify` | Free text; unique **per clinic** (`@@unique([clinicId, identify])`), not globally. |
| Teléfono | `phone` | Free text, no format validation. |
| Correo | `email` | Optional, validated as an email on create. |
| Edad | `birthDate` | Stored as a date; **age is never stored or returned**, it must be derived. |
| Sexo | `gender` | Free-text string, e.g. `Femenino` / `Masculino`. Not an enum. |
| Patologías, alergias, condiciones, antecedentes | `PatientCondition` | Listas estructuradas por tipo, vigencia y origen. `Patient.notes` se conserva como nota general legacy. Ver [`ADR_ANTECEDENTES.md`](ADR_ANTECEDENTES.md). |
| — | `address` | Extra field, not in the original requirement. |

### 2.2 Historias médicas — `MedicalHistory`

One record per consultation of a patient. Answers to the custom intake form are stored
in the `data` JSON column as a flat `{ fieldName: value }` object, keyed by whatever the
client sends — nothing validates it against `CustomField`.

- `title`, `type`, `reason`, `symptoms`, `notes`, `observations`, `diagnosis`,
  `evaluation`, `date`, `vitalSigns` (structured JSON), `data` (JSON answers),
  `patientId`, `clinicId`, `createdById`, timestamps. The clinic and author are assigned
  from the authenticated user; the patient must belong to that clinic.
- `status` es enum: `DRAFT | COMPLETED | AMENDED | CANCELLED | ARCHIVED`. Solo `DRAFT` es
  editable; `COMPLETED` se cierra con `signedAt`/`signedById` y requiere addendum;
  `AMENDED` es una fila nueva firmada que referencia al original con `amendsId`;
  `CANCELLED` conserva el registro y la firma.
- `medicalTreatments` y `treatmentMedications` se reemplazan en una transacción al editar
  un borrador. El medicamento guarda snapshot de nombre, principio activo, presentación y
  concentración.
- `GET /api/medical-histories/patient/:patientId` returns the patient's whole history,
  newest first, so the "historial de múltiples pacientes" is assembled client-side from
  one request per patient.
- Delete is a **soft** delete (`deleted`, `deletedAt`) and only for `DRAFT`.
- La agenda y la asistencia viven en `Appointment` — see §3.1.

### 2.3 Formularios personalizados — `CustomField`

The questionnaire library used at consultation time. Fields belong to clinic-scoped
templates; the legacy `/customize` endpoint associates new fields with that clinic's
`General` template:

- `name`, `fieldType` (free-text string, e.g. `text` / `number` / `select`),
  `isRequired`, `options` (string array, for choice fields), `sortOrder`, `step`
  (which section of the form the field belongs to), `isActive`.
- `PUT /api/customize/reorder` accepts an array of `{ id, sortOrder, step }` and applies
  it in one transaction, only to fields in the active clinic.

### 2.4 Proveedores — `Provider`, `ProviderService`

External services the clinic can refer a patient to (labs, pharmacies, imaging, other
specialists).

Each provider belongs to the active clinic selected from the authenticated user's
token when created. The current model does not store which clinic member created it.

| Spec requirement | Column |
| --- | --- |
| Nombre | `Provider.name` |
| Cargo | `Provider.type` (e.g. `Laboratorio`, `Cardiología`) |
| Empresa | `Provider.businessName` |
| Teléfono | `Provider.phone` (optional) |
| Cédula o RIF | `Provider.identify` (unique per clinic) |
| — | `Provider.email`, `address`, `description` (all optional) |

`ProviderService` is the catalogue of what that provider offers: `name`,
`description?`, `price`. Nested CRUD at `/api/providers/:id/services`.

`ProviderService` can be referenced by a `QuoteItem` (snapshot of name/description/price),
but providers are still not linked to `MedicalHistory` or `Patient`.

### 2.5 Hoja de costos y servicios — `ServiceCost`

The clinic's own price list: `name`, `description`, `price`. Creation associates the row
with the active clinic from the authenticated user's token; it is soft-deleted.
"Lo que incluye" is expected to go in `description` as free text; there is no structured
inclusion list. `ServiceCost` can be referenced by a `QuoteItem` (snapshot of
name/description/price). The model does not record which clinic member created a service,
but `AuditLog` does. Read, update and delete
endpoints are scoped to the active clinic.

### 2.6 Métodos de pago — `PaymentMethod`

Bank account details the patient pays into: `bank`, `identify`, `phone`, `email`,
`account`. Creation associates the record with the active clinic from the authenticated
user's token. Read, update and delete endpoints are scoped to that clinic.
`Quote.paymentMethodId` optionally records which method was offered for a budget.

### 2.7 Presupuestos — `Quote`, `QuoteItem`

The itemised, versioned budget handed to the patient.

- `Quote`: `title`, `description?`, `date`, `validUntil?`, `status` (`QuoteStatus`:
  `DRAFT | SENT | APPROVED | REJECTED | EXPIRED | CANCELLED`), `version`, `rootQuoteId`,
  `supersedesId`, `supersededAt?`, `currency` (ISO 4217, default `USD`),
  `exchangeRate` (snapshot of `Dolar.value`), `subtotal`, `discount`, `tax`, `total`,
  `paymentMethodId?`, `issuedAt?`, `approvedAt?`, `rejectedAt?`, `patientId`, `clinicId`,
  `createdById`, and `dolarId`. Clinic and author come from the authenticated user.
- `QuoteItem`: `name`, `description?`, `quantity` (default 1), `unitPrice`, `total`,
  `sortOrder`, and optional `serviceCostId` / `providerServiceId`.
  `name`, `description` and `unitPrice` are snapshots: changing the catalogue later does
  not alter a saved quote.
- Totals are computed server-side by one domain function:
  `item.total = unitPrice × quantity`; `subtotal = Σ item.total`;
  `total = subtotal − discount + tax`. Rounding is `HALF_UP` to 2 decimals per line and
  then on each aggregate. The client cannot send `total`.
- Only `DRAFT` is editable. `SENT` or higher is immutable; `POST /quotes/:id/revise`
  creates a new `DRAFT` version, marks the previous one as superseded and keeps the root
  reference. `GET /quotes` returns only the latest version unless
  `includeSuperseded=true`.
- **There is no PDF/download route.** "Visualizar o descargar el presupuesto" is
  unimplemented; quotes are JSON only.

### 2.8 Tasa del dólar — `Dolar`

Append-only history of USD rates, one row per UTC calendar day + value. `POST
/api/services-costs/dolar/save` fetches `https://ve.dolarapi.com/v1/dolares/oficial` with
`axios`; `POST /api/services-costs/dolar` stores a manual rate. Duplicate day+value is
idempotent, and an external failure returns `502 UPSTREAM_ERROR`. `GET
/api/services-costs/dolar` is read-only and returns `404` when no rate exists.

---

## 3. Features especificadas

Secciones 3.1 y 3.2 ya implementadas. Las restantes siguen siendo requisitos del
producto sin código; cada una lista el cambio de schema que implica.

### 3.1 Citas y seguimiento (`Appointment`) — implementado

La agenda vive en `AppointmentsModule` (`/api/appointments`). El modelo `Appointment`
tiene `patientId`, `userId`, `scheduledAt`, `durationMin`, `type`, `channel`, `status`,
`reason`, `notes`, timestamps por estado (`confirmedAt`, `attendedAt`, `cancelledAt`,
`noShowAt`, `rescheduledAt`), `medicalHistoryId` opcional/único, `rescheduledFromId` y
baja lógica (`deleted`, `deletedAt`).

- `AppointmentStatus` es enum Prisma: `SCHEDULED`, `CONFIRMED`, `ATTENDED`, `NO_SHOW`,
  `CANCELLED`, `RESCHEDULED`.
- `type`/`channel` se validan contra catálogos cerrados en el DTO.
- `SCHEDULED → CONFIRMED`; `SCHEDULED|CONFIRMED → ATTENDED` (historia obligatoria);
  `SCHEDULED|CONFIRMED → NO_SHOW` (sin historia); `SCHEDULED|CONFIRMED → CANCELLED`;
  `SCHEDULED|CONFIRMED → RESCHEDULED` (cita hija con `rescheduledFromId`).
- El reagendamiento conserva la cadena y se consulta en
  `GET /api/appointments/:id/reschedules`.
- Se rechaza el solapamiento de médico o paciente en estados activos.
- La agenda del dashboard y el listado ordenan por `scheduledAt`.

Detalle de negocio en [`docs/ADR_CITAS.md`](ADR_CITAS.md) y handoff de frontend en
[`docs/CITAS_FRONTEND.md`](CITAS_FRONTEND.md).

### 3.2 Antecedentes clínicos estructurados del paciente — implementado

`PatientCondition` guarda las listas curadas de patologías, alergias, condiciones y
antecedentes por paciente. Se consultan por tipo, etiqueta, vigencia y origen, y se
muestran en la ficha junto a una timeline derivada de las historias.

- Enum `PatientConditionKind`: `PATHOLOGY | ALLERGY | CONDITION | ANTECEDENT`.
- Dedupe por `patientId + kind + normalizedLabel`; reactivación en vez de duplicado.
- `sourceMedicalHistoryId` vincula el antecedente con la historia que lo originó.
- La migración no convierte diagnósticos automáticamente: `Patient.notes` y
  `MedicalHistory.diagnosis` se conservan y el médico crea el antecedente explícitamente.
- Endpoints: `/api/patients/:patientId/conditions` y
  `/api/patients/:patientId/clinical-summary`.

Detalle de decisión, definiciones y estrategia legacy en
[`ADR_ANTECEDENTES.md`](ADR_ANTECEDENTES.md).

### 3.3 Plantillas de formulario por condición

"Una plantilla para hipertensos, otra para problemas gástricos" implies **named,
reusable form templates** that a consultation is filled against. `CustomField` today is
one global list with no grouping, so every field is mixed into every patient's form.

- `FormTemplate`: `name`, `condition` (e.g. `Hipertensión`, `Gástrico`), `description?`,
  `version?`, `isActive`.
- `CustomField.templateId` FK (or move `step`/`sortOrder` onto the field as-is and add
  the FK), so `GET /api/customize` can return templates with their ordered fields.
- A record of which template a `MedicalHistory` was filled against (`templateId` on the
  history, or inside the `data` JSON) so historical answers stay interpretable after a
  template changes.

### 3.4 Reportes, PDF y descarga de presupuestos

"Generar reportes o PDF o presupuestos" has no implementation and **no PDF library in
`package.json`**. Outstanding: a printable/PDF representation of a `Quote`, plus
`application/pdf` (or a download endpoint) and probably clinic header/branding data that
does not exist in the schema yet.

### 3.5 Other gaps worth tracking

- `ProviderService` can be attached to a `QuoteItem`, but `Provider` is still not linked
  to `MedicalHistory`, so "referred this patient to an external lab" is not recorded on
  the clinical side.
- `Quote`/`MedicalHistory` cannot be filtered by every date range the UI would need, but
  the list endpoints do paginate with `page`, `limit` and `search`.
- Role-based authorisation is implemented for sensitive endpoints; the Angular frontend
  still needs to hide those actions (`docs/PERMISOS.md`).

---

## 4. Route inventory (as exposed today)

Global prefix `/api`. Every route requires `Authorization: Bearer <token>` except
`POST /api/auth/login` (see `AGENTS.md` for why `register` is not public). Tokens are
signature-verified against `JWT_SECRET`; responses carry the Helmet header set and CORS
is limited to `CORS_ORIGINS`. Rate limits: 100/min per IP overall, 5/min on
`/auth/login` and `/auth/register`, 1/min on `POST /services-costs/dolar/save`.

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/auth/login` | Public. Returns `{ status, message, data: { access_token, user } }`. |
| `POST` | `/auth/register` | Requires a DOCTOR token for the target clinic; creates ASSISTANT users transactionally. Password: 8+ chars, letter and number. |
| `GET` | `/auth/profile` | Scoped. |
| `GET` | `/` | Nest hello-world stub. |
| `GET` | `/dashboard` | Single clinic-scoped summary: active patients, today/upcoming appointments, monthly consultations and quote counts/amounts by currency. |
| `GET` | `/dashboard/agenda` | Clinic-scoped agenda: today's appointments plus upcoming appointments (`days`, `limit`), with patient summary. |
| `GET` | `/patients` | Scoped, paginated; filters by text, gender, active status and creation dates. |
| `GET` | `/patients/:id` | Scoped. |
| `POST` | `/patients` | Scoped. |
| `PUT` | `/patients/:id` | Scoped, partial update; accepts `isActive:true` to reactivate. Duplicate identify → 409. |
| `DELETE` | `/patients/:id` | Scoped soft delete; second delete → 404. |
| `GET` | `/patients/:patientId/conditions` | Scoped, paginated; filters by `kind`, `isActive` and text. |
| `POST` | `/patients/:patientId/conditions` | DOCTOR; dedupe por tipo + etiqueta normalizada. |
| `GET` | `/patients/:patientId/conditions/:conditionId` | Scoped. |
| `PUT` | `/patients/:patientId/conditions/:conditionId` | DOCTOR; `isActive:true` reactiva. |
| `DELETE` | `/patients/:patientId/conditions/:conditionId` | DOCTOR; desactiva, no borra. |
| `GET` | `/patients/:patientId/clinical-summary` | Ficha: condiciones, alergias, timeline y últimos signos vitales. |
| `GET` | `/medical-histories/patient/:patientId` | Scoped, paginated; verifies patient and filters by text, type, status and creation dates. |
| `GET` | `/medical-histories/:id` | Scoped; incluye `canEdit`, `allowedActions`, addenda y firma. |
| `POST` | `/medical-histories` | Scoped; rejects a `patientId` from another clinic and assigns author from token. |
| `PUT` | `/medical-histories/:id` | Solo `DRAFT`; actualización clínica y reemplazo de tratamientos en una transacción. |
| `PUT` | `/medical-histories/:id/complete` | DOCTOR; `DRAFT → COMPLETED`, guarda `signedAt`/`signedById`. |
| `POST` | `/medical-histories/:id/sign` | Alias de `complete`; permite firmar un `COMPLETED` legacy sin firma. |
| `POST` | `/medical-histories/:id/amend` | DOCTOR; `COMPLETED → AMENDED` en una fila nueva con `amendsId`. |
| `PUT` | `/medical-histories/:id/cancel` | DOCTOR; `DRAFT/COMPLETED → CANCELLED`, conserva el registro. |
| `DELETE` | `/medical-histories/:id` | Solo `DRAFT`; soft delete. |
| `GET` | `/appointments` | Scoped, paginated; filters by date, status, patient, type, user and search (name/lastName/identify). Ordered by `scheduledAt`. |
| `GET` | `/appointments/:id` | Scoped detail with patient, history and reschedule links. |
| `GET` | `/appointments/:id/reschedules` | Scoped full reschedule chain. |
| `POST` | `/appointments` | Scoped; always creates `SCHEDULED`; validates patient, doctor, history and overlap. |
| `PUT` | `/appointments/:id` | Scoped; only `SCHEDULED`/`CONFIRMED`; revalidates overlap. |
| `PUT` | `/appointments/:id/confirm` | `SCHEDULED → CONFIRMED`. |
| `PUT` | `/appointments/:id/attend` | DOCTOR; `SCHEDULED/CONFIRMED → ATTENDED` with required history. |
| `PUT` | `/appointments/:id/no-show` | `SCHEDULED/CONFIRMED → NO_SHOW`; history forbidden. |
| `PUT` | `/appointments/:id/cancel` | `SCHEDULED/CONFIRMED → CANCELLED`. |
| `PUT` | `/appointments/:id/reschedule` | `SCHEDULED/CONFIRMED → RESCHEDULED`; creates child with `rescheduledFromId`. |
| `DELETE` | `/appointments/:id` | DOCTOR; clinic-scoped soft delete. |
| `GET` | `/customize` | Scoped, paginated; filters by text, type, step, required and active status. |
| `GET` | `/customize/:id` | Scoped to active clinic. |
| `POST` | `/customize` | Scoped; associates field with the clinic's `General` template. |
| `PUT` | `/customize/:id` | Scoped to active clinic. |
| `DELETE` | `/customize/:id` | Scoped soft delete. |
| `PUT` | `/customize/reorder` | Scoped to active clinic. |
| `GET` | `/providers` | Scoped, paginated; filters by text, type and active status. |
| `POST` | `/providers` | Associates provider to active clinic. |
| `PUT` | `/providers/:id` | Clinic-scoped. |
| `DELETE` | `/providers/:id` | Clinic-scoped; soft delete. |
| `POST` | `/providers/:id/services` | Clinic-scoped. |
| `PUT` | `/providers/services/:serviceId` | Clinic-scoped. |
| `DELETE` | `/providers/services/:serviceId` | Clinic-scoped; soft delete. |
| `GET` | `/services-costs` | Scoped, paginated; filters by text, active status and price range. |
| `GET` | `/services-costs/:id` | Scoped detail (`404` if inactive or from another clinic). |
| `GET` | `/services-costs/dolar` | Last stored rate (`404` if none). |
| `POST` | `/services-costs/dolar` | Stores a manual rate. |
| `POST` | `/services-costs/dolar/save` | Fetches the external API and stores a new rate (1/min). |
| `POST` | `/services-costs` | Associates cost to active clinic. |
| `PUT` | `/services-costs/:id` | Clinic-scoped. |
| `DELETE` | `/services-costs/:id` | Clinic-scoped; soft delete. |
| `GET` | `/quotes` | Scoped, paginated with relations; filters by text, status, patient, payment method, currency, active status and creation dates. Only latest versions by default. |
| `GET` | `/quotes/:id` | Scoped detail with relations. |
| `GET` | `/quotes/:id/versions` | Scoped full version history. |
| `POST` | `/quotes` | Scoped, transactional; validates patient, dollar, payment method, dates and item snapshots. |
| `PUT` | `/quotes/:id` | Scoped; only `DRAFT` (or `{isActive:true}` reactivation). |
| `POST` | `/quotes/:id/revise` | Scoped; creates a new `DRAFT` version and supersedes the previous one. |
| `PUT` | `/quotes/:id/send` | `DRAFT → SENT`. |
| `PUT` | `/quotes/:id/approve` | DOCTOR; `SENT → APPROVED`. |
| `PUT` | `/quotes/:id/reject` | DOCTOR; `SENT → REJECTED`. |
| `PUT` | `/quotes/:id/cancel` | `DRAFT/SENT/APPROVED → CANCELLED`. |
| `PUT` | `/quotes/:id/expire` | `SENT/APPROVED → EXPIRED`. |
| `DELETE` | `/quotes/:id` | DOCTOR; scoped soft delete of the latest version. |
| `GET` | `/payment-info` | Scoped, paginated; filters by text and active status. |
| `POST` | `/payment-info` | Associates method to active clinic. |
| `PUT` | `/payment-info/:id` | Clinic-scoped. |
| `DELETE` | `/payment-info/:id` | Clinic-scoped; soft delete. |

No `GET /providers/:id` or `GET /payment-info/:id` route exists even though the services
implement `findOne` for some of them.

---

## 5. Open decisions

1. ~~**Who computes the quote total?**~~ Resolved: the server computes line, subtotal,
   discount, tax and total; the client cannot send `total`.
2. ~~**Is a quote immutable once issued?**~~ Resolved: `DRAFT` is editable, `SENT` or
   higher is immutable, and `POST /quotes/:id/revise` issues a new version.
3. ~~**Appointments vs. history records**~~ Resuelto: son dos tablas. `Appointment`
   gestiona agenda, estados y reagendamiento; `MedicalHistory` guarda el contenido
   clínico. El vínculo es 1:1 opcional (`Appointment.medicalHistoryId` único).
4. **Template versioning**: if a form template is edited after patients were evaluated
   with it, historical answers must stay interpretable. Decide between immutable
   versions and a "snapshot the field definitions into `MedicalHistory.data`" approach.
