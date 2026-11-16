# Dashboard: resumen y agenda del consultorio

Endpoints de solo lectura para las tarjetas, contadores y agenda del dashboard. El
resumen devuelve los indicadores en una sola petición y la agenda entrega las citas de
hoy y las próximas.

## Endpoints

| Método | Ruta | Auth | Rol |
| --- | --- | --- | --- |
| `GET` | `/api/dashboard` | `Authorization: Bearer <token>` | `DOCTOR` o `ASSISTANT` |
| `GET` | `/api/dashboard/agenda` | `Authorization: Bearer <token>` | `DOCTOR` o `ASSISTANT` |

El resumen no recibe parámetros. La agenda acepta `days` y `limit` (ver más abajo). El
consultorio se toma del token activo (`clinicId` de la membresía). Para consultar otro
consultorio, el frontend debe llamar primero a `POST /api/auth/switch-clinic`.

## Resumen

`GET /api/dashboard`.

## Respuesta

Contrato de detalle de la API: `{ data }`.

```json
{
  "data": {
    "clinicId": "6f7f8f7e-1c2b-4b8a-9a52-0f1d2c3b4a5e",
    "generatedAt": "2026-10-31T14:00:00.000Z",
    "timezone": "America/Caracas",
    "patients": {
      "active": 24
    },
    "appointments": {
      "today": 3,
      "upcoming": 8
    },
    "consultations": {
      "month": 41
    },
    "quotes": {
      "pending": {
        "count": 4,
        "totalsByCurrency": [
          { "currency": "USD", "amount": "1250.00" },
          { "currency": "VES", "amount": "500.00" }
        ]
      },
      "approved": {
        "count": 3,
        "totalsByCurrency": [
          { "currency": "USD", "amount": "3000.00" },
          { "currency": "VES", "amount": "100.00" }
        ]
      },
      "total": {
        "count": 7,
        "totalsByCurrency": [
          { "currency": "USD", "amount": "4250.00" },
          { "currency": "VES", "amount": "600.00" }
        ]
      }
    }
  }
}
```

## Campos

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `clinicId` | `string` | Consultorio activo usado para filtrar todos los conteos. |
| `generatedAt` | `string` | Momento en que se calculó el resumen (ISO 8601 UTC). |
| `timezone` | `string` | Zona usada para los límites de día y mes. Hoy: `America/Caracas`. |
| `patients.active` | `number` | Pacientes con `isActive: true` en el consultorio. |
| `appointments.today` | `number` | Citas de hoy que no están canceladas ni borradas. |
| `appointments.upcoming` | `number` | Citas de los próximos 7 días, desde mañana, sin incluir las de hoy. |
| `consultations.month` | `number` | Historias clínicas no borradas con `date` dentro del mes actual. |
| `quotes.pending.count` | `number` | Presupuestos vigentes en estado `DRAFT` o `SENT`. |
| `quotes.approved.count` | `number` | Presupuestos vigentes en estado `APPROVED`. |
| `quotes.total.count` | `number` | Suma de presupuestos pendientes + aprobados. |
| `totalsByCurrency` | `array` | Montos agrupados por moneda. Nunca se suman monedas distintas. |
| `totalsByCurrency[].currency` | `string` | Código ISO 4217 guardado en `Quote.currency`. |
| `totalsByCurrency[].amount` | `string` | Suma de `Quote.total` con 2 decimales. Es string por la serialización de `Decimal`. |

## Reglas de cálculo

### Pacientes

```ts
patient.count({ where: { clinicId, isActive: true } })
```

Los pacientes inactivos (soft delete) no se cuentan.

### Citas de hoy

Una cita cuenta si:

- pertenece al consultorio activo;
- `deleted: false`;
- `cancelledAt: null`;
- `status` no es `CANCELLED` ni `NO_SHOW`;
- `scheduledAt` cae entre el inicio y el final del día actual en `America/Caracas`.

### Citas próximas

Se usa la misma base de citas válidas, desde el inicio de mañana hasta el inicio del día
`hoy + 8` (ventana de 7 días). Así `today` y `upcoming` no se solapan.

### Consultas del mes

```ts
medicalHistory.count({
  where: {
    clinicId,
    deleted: false,
    date: { gte: inicioDelMes, lt: inicioDelMesSiguiente },
  },
})
```

Se usa `MedicalHistory.date` (fecha clínica de la consulta), no `createdAt`.

### Presupuestos

Solo se consideran versiones vigentes:

- `clinicId` del token;
- `isActive: true`;
- `supersededAt: null` (excluye versiones reemplazadas);
- estados `DRAFT`, `SENT` o `APPROVED`.

| Grupo | Estados incluidos |
| --- | --- |
| Pendientes | `DRAFT`, `SENT` |
| Aprobados | `APPROVED` |
| Total | Pendientes + aprobados |

Los estados `REJECTED`, `EXPIRED` y `CANCELLED` no forman parte del resumen.

### Monedas

Cada presupuesto guarda su propia `currency`. Por eso los montos se devuelven como
`totalsByCurrency` y no como un único número: sumar USD con VES produciría un total
incorrecto. El frontend debe mostrar una cifra por moneda o elegir la moneda principal
del consultorio.

Si el consultorio solo usa una moneda, `totalsByCurrency` tendrá un único elemento.

## Ejemplo de consumo

```ts
const { data } = await http.get('/dashboard').toPromise();

const activePatients = data.patients.active;
const todayAppointments = data.appointments.today;
const upcomingAppointments = data.appointments.upcoming;
const monthConsultations = data.consultations.month;
const pendingQuotes = data.quotes.pending;
const approvedQuotes = data.quotes.approved;
const totalQuotes = data.quotes.total;

const usdTotal = data.quotes.total.totalsByCurrency.find(
  (item) => item.currency === 'USD',
)?.amount ?? '0.00';
```

## Agenda

`GET /api/dashboard/agenda` devuelve la agenda de hoy y las próximas citas.

### Parámetros

| Parámetro | Tipo | Default | Rango | Descripción |
| --- | --- | --- | --- | --- |
| `days` | `int` | `7` | `1..31` | Días de la ventana de próximas citas, contados desde mañana. |
| `limit` | `int` | `20` | `1..100` | Máximo de próximas citas devueltas. No aplica a la agenda de hoy. |

Los parámetros desconocidos responden `400` por el `ValidationPipe` global.

### Respuesta

```json
{
  "data": {
    "clinicId": "6f7f8f7e-1c2b-4b8a-9a52-0f1d2c3b4a5e",
    "generatedAt": "2026-10-31T14:00:00.000Z",
    "timezone": "America/Caracas",
    "today": {
      "date": "2026-10-31",
      "count": 1,
      "appointments": [
        {
          "id": "5c1f8a7e-2b6d-4f0a-9c3e-7a1d2b4c5e6f",
          "scheduledAt": "2026-10-31T15:00:00.000Z",
          "durationMin": 30,
          "status": "CONFIRMED",
          "type": "CONSULTA_GENERAL",
          "channel": "IN_PERSON",
          "reason": "Control",
          "confirmedAt": "2026-10-30T18:00:00.000Z",
          "attendedAt": null,
          "patient": {
            "id": "0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
            "name": "Ana",
            "lastName": "García",
            "identify": "V-12345678",
            "phone": "0414-1234567"
          }
        }
      ]
    },
    "upcoming": {
      "from": "2026-11-01",
      "to": "2026-11-07",
      "count": 8,
      "limit": 20,
      "hasMore": false,
      "appointments": []
    }
  }
}
```

### Campos

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `today.date` | `string` | Fecha actual en `America/Caracas`, formato `YYYY-MM-DD`. |
| `today.count` | `number` | Total de citas válidas de hoy. |
| `today.appointments` | `array` | Agenda completa de hoy, ordenada por `scheduledAt` ascendente. |
| `upcoming.from` | `string` | Primer día de la ventana futura (mañana). |
| `upcoming.to` | `string` | Último día incluido de la ventana futura. |
| `upcoming.count` | `number` | Total real de citas próximas en la ventana. |
| `upcoming.limit` | `number` | Límite aplicado a `upcoming.appointments`. |
| `upcoming.hasMore` | `boolean` | `true` si `count` supera la cantidad devuelta. |
| `upcoming.appointments` | `array` | Próximas citas, ordenadas por `scheduledAt` ascendente. |

Cada cita incluye `id`, `scheduledAt`, `durationMin`, `status`, `type`, `channel`,
`reason`, `confirmedAt`, `attendedAt` y el paciente con `id`, `name`, `lastName`,
`identify` y `phone`.

### Reglas

- Se aplica el mismo filtro de citas válidas que el resumen: `clinicId` del token,
  `deleted: false`, `cancelledAt: null` y estado distinto de `CANCELLED`, `NO_SHOW` y
  `RESCHEDULED`.
- **Hoy:** desde el inicio del día actual hasta el inicio de mañana en
  `America/Caracas`.
- **Próximas:** desde mañana hasta el inicio del día `hoy + days + 1`; `to` muestra el
  último día incluido.
- `scheduledAt`, `confirmedAt` y `attendedAt` se serializan como ISO 8601 UTC.
- Las citas no se paginan en bloques: hoy se devuelve completo y las próximas se
  recortan con `limit`.

### Ejemplo de consumo

```ts
const { data: agenda } = await http
  .get('/dashboard/agenda', { params: { days: 7, limit: 20 } })
  .toPromise();

const todayAppointments = agenda.today.appointments;

for (const appointment of agenda.upcoming.appointments) {
  const when = new Date(appointment.scheduledAt);
  const patientName = `${appointment.patient.name} ${appointment.patient.lastName}`;
  console.log(when, patientName, appointment.status);
}
```

## Errores

| HTTP | Cuándo |
| --- | --- |
| `401` | Token ausente, inválido o vencido. |
| `403` | El usuario no tiene una membresía activa en el consultorio del token. |
| `500` | Error inesperado; responde `{ status: false, message, code, requestId }`. |

## Notas de implementación

- No hay cambios de schema ni migraciones: usa `Patient`, `Appointment`,
  `MedicalHistory` y `Quote`.
- No genera registros de auditoría porque es una lectura.
- No requiere `METRICS_TOKEN`; ese token es solo para `GET /api/metrics` (Prometheus).
- Todos los conteos se ejecutan en paralelo con `Promise.all`; los presupuestos usan un
  único `groupBy` por `status` y `currency`.
- Los límites de día y mes se calculan con `Intl.DateTimeFormat` sobre
  `America/Caracas`, sin agregar dependencias.
