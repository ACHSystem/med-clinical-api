# Citas — handoff para el frontend (`med-clinical`)

Base: `/api/appointments`. Todas las rutas requieren `Authorization: Bearer <token>`.
El consultorio se toma del token activo (`clinicId` de la membresía). No envíes `clinicId`.

Referencia de negocio y estados: [`docs/ADR_CITAS.md`](ADR_CITAS.md).

## 1. Envelopes

| Operación | Respuesta |
| --- | --- |
| Listado | `{ data: Appointment[], pagination: { page, limit, totalElements, totalPages } }` |
| Detalle | `{ data: Appointment }` |
| Alta / edición / transiciones / baja | `{ status: true, message, data }` |
| Error | `{ status: false, message, code, requestId }` |

Los errores relevantes para la UI:

| HTTP | `code` | Cuándo |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Payload inválido, campo no permitido, `type`/`channel` fuera del catálogo |
| `400` | `BAD_REQUEST` | Transición de estado no permitida, falta historia al atender, historia de otro paciente, ambos `medicalHistoryId` y `history` |
| `403` | `FORBIDDEN` | ASSISTANT intenta `ATTEND` o `DELETE` |
| `404` | `NOT_FOUND` | Cita/paciente/historia/médico inexistente o de otra clínica |
| `409` | `CONFLICT` | Solapamiento de médico/paciente o historia ya vinculada a otra cita |

## 2. Catálogos

`status` (enum Prisma):

```text
SCHEDULED | CONFIRMED | ATTENDED | NO_SHOW | CANCELLED | RESCHEDULED
```

`type`:

```text
GENERAL_CONSULT, FOLLOW_UP, SPECIALIST_CONSULT, INTERCONSULT, EMERGENCY,
PROCEDURE, TELEMEDICINE, POST_OP_FOLLOW_UP, LAB_REVIEW
```

`channel`:

```text
IN_PERSON, TELEMEDICINE, PHONE
```

`durationMin`: entero entre `5` y `480`. Default `30`.

## 3. Endpoints

| Método | Ruta | Rol | Uso |
| --- | --- | --- | --- |
| `GET` | `/appointments` | Cualquiera | Agenda / ficha del paciente |
| `GET` | `/appointments/:id` | Cualquiera | Detalle |
| `GET` | `/appointments/:id/reschedules` | Cualquiera | Cadena de reagendamientos |
| `POST` | `/appointments` | Cualquiera | Alta desde agenda o desde historia |
| `PUT` | `/appointments/:id` | Cualquiera | Editar cita `SCHEDULED`/`CONFIRMED` |
| `PUT` | `/appointments/:id/confirm` | Cualquiera | `SCHEDULED → CONFIRMED` |
| `PUT` | `/appointments/:id/attend` | **DOCTOR** | `SCHEDULED/CONFIRMED → ATTENDED` + historia |
| `PUT` | `/appointments/:id/no-show` | Cualquiera | `SCHEDULED/CONFIRMED → NO_SHOW` |
| `PUT` | `/appointments/:id/cancel` | Cualquiera | `SCHEDULED/CONFIRMED → CANCELLED` |
| `PUT` | `/appointments/:id/reschedule` | Cualquiera | `SCHEDULED/CONFIRMED → RESCHEDULED` + hija |
| `DELETE` | `/appointments/:id` | **DOCTOR** | Baja lógica |

Aliases deprecados de solo lectura:

- `GET /api/medical-histories/appointments`
- `GET /api/medical-histories/appointments/:id`

Usa `/api/appointments` en código nuevo. Los aliases existen para no romper pantallas viejas.

## 4. Listado y agenda

`GET /api/appointments` acepta:

| Query | Tipo | Notas |
| --- | --- | --- |
| `page` | int | Default `1` |
| `limit` | int | Default `50`, máximo `100` |
| `dateStart` | ISO 8601 | `scheduledAt >= dateStart` |
| `dateTo` | ISO 8601 | `scheduledAt <= dateTo` |
| `status` | enum | Ej. `SCHEDULED` |
| `patientId` | uuid | Ficha del paciente |
| `type` | catálogo | Ej. `FOLLOW_UP` |
| `userId` | uuid | Agenda de un médico |
| `search` | string | Nombre, apellido, cédula del paciente o motivo |
| `order` | `asc`/`desc` | Orden por `scheduledAt`, default `asc` |

Ejemplo:

```http
GET /api/appointments?dateStart=2026-11-01T04:00:00.000Z&dateTo=2026-11-08T03:59:59.999Z&status=SCHEDULED&order=asc
```

Cada elemento incluye como mínimo:

```json
{
  "id": "uuid",
  "scheduledAt": "2026-11-02T14:00:00.000Z",
  "durationMin": 30,
  "status": "SCHEDULED",
  "channel": "IN_PERSON",
  "type": "GENERAL_CONSULT",
  "reason": "Control",
  "notes": null,
  "medicalHistoryId": null,
  "rescheduledFromId": null,
  "confirmedAt": null,
  "attendedAt": null,
  "cancelledAt": null,
  "noShowAt": null,
  "rescheduledAt": null,
  "patient": {
    "id": "uuid",
    "name": "Ana",
    "lastName": "Pérez",
    "identify": "V-12345678",
    "phone": "+58412..."
  },
  "user": {
    "id": "uuid",
    "name": "Juan",
    "lastName": "Pérez"
  }
}
```

Para la agenda diaria usa `dateStart`/`dateTo` con los límites del día en la zona horaria
del consultorio (`America/Caracas`) y `order=asc`.

## 5. Detalle

`GET /api/appointments/:id` devuelve el mismo objeto más:

- `patient` con datos de contacto;
- `medicalHistory` (o `null`) con `id`, `title`, `type`, `date`, `status`, `signedAt`,
  `createdAt`;
- `rescheduledFrom` y `rescheduledTo` (`null` o `{ id, scheduledAt, status }`).

## 6. Alta

### 6.1 Desde la agenda

```json
POST /api/appointments
{
  "patientId": "uuid-paciente",
  "scheduledAt": "2026-11-02T14:00:00.000Z",
  "durationMin": 30,
  "type": "GENERAL_CONSULT",
  "channel": "IN_PERSON",
  "reason": "Dolor abdominal",
  "notes": "Paciente nuevo",
  "userId": "uuid-medico"
}
```

- `patientId` y `scheduledAt` son obligatorios.
- `userId` es el médico asignado. Si se omite, se usa el usuario autenticado.
- La cita nace siempre en `SCHEDULED`.
- No envíes `status`: no está permitido en el DTO.

### 6.2 Desde una historia existente

Añade `medicalHistoryId`:

```json
{
  "patientId": "uuid-paciente",
  "scheduledAt": "2026-12-01T09:00:00.000Z",
  "medicalHistoryId": "uuid-historia",
  "type": "FOLLOW_UP",
  "channel": "IN_PERSON"
}
```

El servidor valida que la historia:

- sea de la clínica;
- sea del mismo paciente;
- no esté borrada;
- no esté vinculada ya a otra cita (`409`).

La historia **no se duplica**.

## 7. Edición

`PUT /api/appointments/:id` acepta un subconjunto de:

```json
{
  "scheduledAt": "2026-11-03T10:00:00.000Z",
  "durationMin": 45,
  "type": "FOLLOW_UP",
  "channel": "TELEMEDICINE",
  "reason": "Control",
  "notes": "Reprogramada por el paciente",
  "userId": "uuid-medico"
}
```

Reglas para la UI:

- Solo `SCHEDULED` y `CONFIRMED` se editan.
- `patientId`, `status` y `medicalHistoryId` no se editan por esta ruta.
- Si cambias `scheduledAt`, `durationMin` o `userId`, el backend revalida solapamiento.

## 8. Transiciones

| Acción | Endpoint | Body | Efecto |
| --- | --- | --- | --- |
| Confirmar | `PUT /:id/confirm` | vacío | `CONFIRMED`, `confirmedAt` |
| Atender | `PUT /:id/attend` | ver abajo | `ATTENDED`, `attendedAt`, historia |
| No asistió | `PUT /:id/no-show` | vacío | `NO_SHOW`, `noShowAt`, sin historia |
| Cancelar | `PUT /:id/cancel` | vacío | `CANCELLED`, `cancelledAt` |
| Reagendar | `PUT /:id/reschedule` | ver abajo | original `RESCHEDULED` + hija |

Transiciones inválidas → `400 BAD_REQUEST` con mensaje explícito. La UI debe ocultar las
acciones no disponibles según `status`.

### 8.1 Atender con historia existente

```json
PUT /api/appointments/:id/attend
{
  "medicalHistoryId": "uuid-historia"
}
```

### 8.2 Atender creando la historia inline

```json
PUT /api/appointments/:id/attend
{
  "history": {
    "title": "Consulta general",
    "type": "GENERAL_CONSULT",
    "reason": "Dolor abdominal",
    "symptoms": "Dolor epigástrico",
    "notes": "",
    "observations": "",
    "diagnosis": "Gastritis",
    "evaluation": "Sin signos de alarma",
    "date": "2026-11-02T14:00:00.000Z",
    "status": "COMPLETED",
    "vitalSigns": {},
    "data": {},
    "medicalTreatments": []
  }
}
```

Reglas:

- Envía `medicalHistoryId` **o** `history`, nunca ambos.
- Si la cita ya tenía historia, no envíes ninguno.
- Si la cita no tiene historia y no envías ninguno → `400`.
- `patientId` se toma de la cita; no lo envíes dentro de `history`.
- Es exclusivo de DOCTOR.

## 9. Reagendar

```json
PUT /api/appointments/:id/reschedule
{
  "scheduledAt": "2026-11-05T09:00:00.000Z",
  "durationMin": 30,
  "type": "FOLLOW_UP",
  "channel": "IN_PERSON",
  "reason": "El paciente no pudo asistir",
  "userId": "uuid-medico"
}
```

`userId` es opcional; si se omite se conserva el médico original. El resto de campos
opcionales heredan el valor de la cita original.

Respuesta:

```json
{
  "status": true,
  "message": "Cita reagendada exitosamente",
  "data": {
    "original": { "...": "cita original en RESCHEDULED" },
    "newAppointment": { "...": "cita hija en SCHEDULED con rescheduledFromId" }
  }
}
```

La UI debe:

1. Quitar la cita original de la agenda activa (ya está `RESCHEDULED`).
2. Refrescar con la nueva cita que devuelve `data.newAppointment`.
3. Si la original tenía `medicalHistoryId`, la hija es la nueva dueña del vínculo.

No se puede reagendar `ATTENDED`, `CANCELLED`, `NO_SHOW` ni `RESCHEDULED`.

## 10. Historial de reagendamientos

```http
GET /api/appointments/:id/reschedules
```

Respuesta:

```json
{
  "data": {
    "appointmentId": "uuid-consultada",
    "rootId": "uuid-raiz",
    "chain": [
      { "id": "uuid-raiz", "scheduledAt": "...", "status": "RESCHEDULED", "rescheduledTo": { "id": "uuid-hija" }, "patient": {} },
      { "id": "uuid-hija", "scheduledAt": "...", "status": "SCHEDULED", "rescheduledTo": null, "patient": {} }
    ]
  }
}
```

La cadena va de la más antigua a la más reciente. Puedes consultarla desde cualquier cita
de la cadena; el backend resuelve la raíz.

## 11. Baja lógica

```http
DELETE /api/appointments/:id
```

- Exclusivo de DOCTOR.
- Marca `deleted: true` y `deletedAt`; no borra filas.
- Un segundo delete o una cita ya borrada → `404`.
- La cita deja de aparecer en listados y agenda.

## 12. Solapamientos

Antes de habilitar “Guardar” o “Reagendar”, puedes validar en cliente, pero el backend es
la fuente de verdad:

- mismo médico en la misma clínica, o
- mismo paciente,
- con estados `SCHEDULED`, `CONFIRMED`, `ATTENDED`,
- e intervalos `[scheduledAt, scheduledAt + durationMin)` cruzados.

Respuesta `409 CONFLICT`:

```text
El médico ya tiene otra cita en ese horario (<ISO>)
El paciente ya tiene otra cita en ese horario (<ISO>)
```

## 13. Reglas de UI recomendadas

- Agenda: mostrar `scheduledAt`, paciente, `type`, `channel`, `durationMin`, `status`.
- Acciones por estado:
  - `SCHEDULED`: confirmar, atender, no-show, cancelar, reagendar, editar.
  - `CONFIRMED`: atender, no-show, cancelar, reagendar, editar.
  - `ATTENDED`: solo ver historia y trazabilidad.
  - `NO_SHOW`, `CANCELLED`, `RESCHEDULED`: solo lectura e historial.
- Ocultar “Atender” y “Eliminar” si `role !== 'DOCTOR'`.
- En la ficha del paciente, usar `GET /appointments?patientId=<id>&order=desc` para el
  timeline de citas.
- En la historia clínica, para agendar seguimiento usa `POST /appointments` con el
  `patientId` de la historia. Si la historia aún no está vinculada a ninguna cita, puedes
  enviar `medicalHistoryId`; si ya lo está, omítelo para no duplicar el vínculo.
- Fechas: enviar y mostrar en ISO 8601; formatear en `America/Caracas`.
- Tras cualquier transición, reemplazar la cita con el `data` devuelto y refrescar la
  agenda.

## 14. Compatibilidad

- `GET /api/medical-histories/appointments` y `.../:id` siguen funcionando como aliases
  de lectura.
- `POST /api/medical-histories` ya **no** acepta el campo `appointment`. Crea primero la
  historia y luego la cita con `POST /api/appointments`, o usa `attend` con `history`.
- `Appointment.status` pasó de texto libre a enum. Si había valores históricos, se
  normalizaron a los estados actuales.
