# ADR 001 — Modelo y ciclo de vida de las citas

- **Estado:** Aceptado
- **Fecha:** 2026-10-31
- **Contexto:** gestión de agenda clínica, historia clínica y reagendamientos.

## 1. Contexto

Antes de este cambio las citas vivían dentro de `medical-histories`:

- `Appointment.status` era texto libre.
- `type` y `channel` no tenían catálogo validado.
- No existía una transición formal entre estados.
- No había forma de conservar la trazabilidad de un reagendamiento.
- El vínculo cita ↔ historia no tenía reglas de negocio más allá del índice único.
- La agenda no tenía un módulo propio ni endpoints de alta, edición y baja lógica.

El producto necesita una agenda operativa (secretaría/doctor) y, al mismo tiempo,
garantizar que una cita atendida tenga historia clínica y que una inasistencia no la tenga.

## 2. Decisión

### 2.1 Módulo separado

Las citas pasan a un `AppointmentsModule` con base `/api/appointments`. Se mantienen
aliases deprecados de solo lectura:

- `GET /api/medical-histories/appointments`
- `GET /api/medical-histories/appointments/:id`

Estos aliases se registran antes de `/medical-histories/:id` para evitar colisiones de ruta.

### 2.2 Estados

`AppointmentStatus` es un enum de Prisma:

```text
SCHEDULED | CONFIRMED | ATTENDED | NO_SHOW | CANCELLED | RESCHEDULED
```

Transiciones permitidas:

| Desde | Acción | Hacia | Timestamp | Historia |
| --- | --- | --- | --- | --- |
| `SCHEDULED` | confirmar | `CONFIRMED` | `confirmedAt` | sin cambio |
| `SCHEDULED`, `CONFIRMED` | atender | `ATTENDED` | `attendedAt` | obligatoria |
| `SCHEDULED`, `CONFIRMED` | no asistió | `NO_SHOW` | `noShowAt` | prohibida |
| `SCHEDULED`, `CONFIRMED` | cancelar | `CANCELLED` | `cancelledAt` | sin cambio |
| `SCHEDULED`, `CONFIRMED` | reagendar | `RESCHEDULED` | `rescheduledAt` | se transfiere a la hija |

Cualquier otra transición responde `400 BAD_REQUEST` con el mensaje:

```text
No se puede pasar la cita de <ESTADO_ORIGEN> a <ESTADO_DESTINO>
```

`ATTENDED`, `CANCELLED`, `NO_SHOW` y `RESCHEDULED` son estados terminales para las
acciones de agenda. Una cita terminal no se edita ni se vuelve a reagendar.

### 2.3 Catálogos de `type` y `channel`

`type` y `channel` siguen siendo `String` en Prisma para no forzar una migración destructiva
de datos históricos, pero la API los valida con una lista cerrada:

`type`:

```text
GENERAL_CONSULT, FOLLOW_UP, SPECIALIST_CONSULT, INTERCONSULT, EMERGENCY,
PROCEDURE, TELEMEDICINE, POST_OP_FOLLOW_UP, LAB_REVIEW
```

`channel`:

```text
IN_PERSON, TELEMEDICINE, PHONE
```

La lista de `type` está alineada con `MedicalHistoryType`. Un valor fuera del catálogo
responde `400 VALIDATION_ERROR`.

### 2.4 `rescheduledFromId`

El reagendamiento crea una **cita hija** y conserva la cadena:

- La cita original pasa a `RESCHEDULED`, guarda `rescheduledAt` y no se borra.
- La cita hija nace en `SCHEDULED`.
- La hija apunta a la original con `rescheduledFromId`.
- `rescheduledFromId` es `@unique`: cada cita solo puede originar una hija directa.
- Si la cita original tenía historia vinculada, el vínculo se transfiere a la hija para
  respetar la unicidad `medicalHistoryId`.
- `GET /appointments/:id/reschedules` devuelve la cadena completa desde la raíz.

No se puede reagendar una cita `ATTENDED`, `CANCELLED`, `NO_SHOW` o `RESCHEDULED`.

### 2.5 Creación desde agenda o desde historia

Hay un único endpoint de alta, `POST /appointments`:

- **Desde la agenda:** el cliente envía `patientId`, `scheduledAt` y los datos de Agenda.
  La cita nace en `SCHEDULED`.
- **Desde una historia:** el cliente envía además `medicalHistoryId`. El servidor valida
  que la historia sea de la clínica, del mismo paciente, que no esté borrada y que no esté
  vinculada a otra cita. La historia no se duplica.

`patientId` es inmutable después del alta. Si se agenda al paciente equivocado, se cancela
la cita y se crea otra.

### 2.6 Reglas de solapamiento

Se bloquea el solapamiento en la misma clínica para:

1. el mismo `userId` (médico asignado), y
2. el mismo `patientId`.

Dos citas se solapan si sus intervalos `[scheduledAt, scheduledAt + durationMin)` se cruzan.
Solo ocupan agenda los estados `SCHEDULED`, `CONFIRMED` y `ATTENDED`; se excluyen
`CANCELLED`, `NO_SHOW` y `RESCHEDULED`.

La respuesta es `409 CONFLICT` con mensaje distinto para médico y paciente. La validación
aplica al alta, a la edición de fecha/duración/médico y al reagendamiento.

### 2.7 Invariantes de historia por cita

| Invariante | Implementación |
| --- | --- |
| `medicalHistoryId` opcional y único | `@unique` en Prisma y en la migración |
| Una historia no puede estar en dos citas | índice único + validación de servicio |
| `ATTENDED` siempre tiene historia | servicio + `CHECK` en PostgreSQL |
| `NO_SHOW` nunca tiene historia | servicio + `CHECK` en PostgreSQL |

Al marcar `ATTENDED`, el cliente puede:

- enviar `medicalHistoryId` de una historia existente, o
- enviar `history` con el payload clínico para crearla inline.

Ambas operaciones se hacen en una sola transacción con el cambio de estado.

## 3. Consecuencias

- El frontend debe usar `/api/appointments`; los aliases legacy solo cubren lectura.
- `CreateMedicalHistoryDto.appointment` deja de existir. La creación de la cita desde una
  historia se hace con `POST /appointments` y `medicalHistoryId`.
- El listado de citas responde `{data, pagination}` ordenado por `scheduledAt`.
- El detalle responde `{data}` con paciente, historia, `rescheduledFrom` y `rescheduledTo`.
- La agenda del dashboard excluye `CANCELLED`, `NO_SHOW` y `RESCHEDULED`.
- Toda transición y reagendamiento queda en `AuditLog` como `UPDATE`/`CREATE` de
  `Appointment`, sin guardar contenido clínico en `metadata`.
