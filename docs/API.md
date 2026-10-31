# API — med-clinical-api

Contrato de integración para el frontend Angular (`med-clinical`).

- **Base URL local:** `http://localhost:3000/api`
- **Prefijo:** todas las rutas empiezan por `/api`
- **Autenticación:** `Authorization: Bearer <access_token>` salvo `POST /api/auth/login` y `GET /api/metrics`
- **Credenciales del seed:** usuario `admin`, contraseña `admin`

---

## 1. Convenciones globales

### 1.1 Envolturas de respuesta

| Tipo de endpoint | Forma |
| --- | --- |
| Escritura (`POST`, `PUT`, `DELETE`) | `{ "status": true, "message": "...", "data": {...} }` |
| Detalle (`GET` de un recurso) | `{ "data": {...} }` |
| Lista (`GET` de colección) | `{ "data": [...], "pagination": { "page", "limit", "totalElements", "totalPages" } }` |
| Error | `{ "status": false, "message": "...", "code": "...", "requestId": "..." }` |

Ya no existen las variantes `success` ni los objetos desnudos.

### 1.2 Errores

```json
{
  "status": false,
  "message": "Paciente no encontrado",
  "code": "NOT_FOUND",
  "requestId": "4a4f2b8e-..."
}
```

| HTTP | `code` | Cuándo |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Faltan campos, tipos inválidos o campos no declarados |
| `400` | `BAD_REQUEST` | Regla de negocio inválida |
| `401` | `UNAUTHORIZED` | Sin token, token inválido/expirado o credenciales incorrectas |
| `403` | `FORBIDDEN` | El rol de la membresía no permite la acción |
| `404` | `NOT_FOUND` | No existe o pertenece a otra clínica |
| `409` | `CONFLICT` | Conflicto de estado, por ejemplo firmar dos veces |
| `429` | `RATE_LIMITED` | Límite de peticiones excedido |
| `500` | `INTERNAL_ERROR` | Error no controlado; el detalle solo queda en el log |
| `502` | `UPSTREAM_ERROR` | Falló la API externa del dólar |
| `503` | `SERVICE_UNAVAILABLE` | Servicio temporalmente no disponible |

`requestId` también viaja en el header `x-request-id` de toda respuesta.

### 1.3 Paginación

Todos los listados aceptan:

- `page`: entero desde `1` (default `1`)
- `limit`: entero entre `1` y `100` (default `50`)
- `search`: texto opcional

La respuesta es siempre:

```json
{
  "data": [],
  "pagination": { "page": 1, "limit": 50, "totalElements": 0, "totalPages": 0 }
}
```

### 1.4 Reglas de tipos

1. Los `Decimal` viajan como **string** (`"500.00"`); al enviar se manda número JSON.
2. Las fechas son ISO 8601 UTC.
3. `PUT` no es parcial en `providers`, `provider-services`, `services-costs` y `payment-info`; sí lo es en `patients`, `quotes`, `medical-histories` y `customize`.
4. Campos no declarados en el DTO producen `400 VALIDATION_ERROR`.
5. Cuerpo máximo: 100 kB.

### 1.5 Límites de peticiones

| Ámbito | Límite |
| --- | --- |
| Global | 100 req/min |
| `POST /auth/login`, `POST /auth/register` | 5 req/min |
| `POST /services-costs/dolar/save` | 1 req/min |

### 1.6 Multitenencia

`patients`, `medical-histories`, `quotes`, `providers`, `services-costs`, `payment-info`, `customize` y `dashboard` se filtran por el consultorio activo del token en lecturas y escrituras. Acceder a un recurso de otra clínica devuelve `404`.

`Dolar` es global.

### 1.7 Roles

La matriz completa está en [`docs/PERMISOS.md`](PERMISOS.md). Resumen:

- **DOCTOR:** acceso completo.
- **ASSISTANT:** lectura de todo; puede crear/editar pacientes y presupuestos; no puede borrar, escribir historias clínicas, firmar, administrar plantillas/proveedores/costos/pagos ni guardar el dólar.

---

## 2. Auth

Base: `/api/auth`.

| Método | Ruta | Auth | Rol | Respuesta |
| --- | --- | --- | --- | --- |
| `POST` | `/auth/login` | No | — | `{status,message,data:{access_token,user,clinic,clinics}}` |
| `POST` | `/auth/register` | Sí | DOCTOR | `{status,message,data:{access_token,user,clinic,clinics}}` |
| `GET` | `/auth/clinics` | Sí | Cualquiera | `{data,pagination}` |
| `POST` | `/auth/switch-clinic` | Sí | Cualquiera | `{status,message,data:{access_token,clinic}}` |
| `GET` | `/auth/profile` | Sí | Cualquiera | `{data:{id,email,name,lastName,username,role,clinic}}` |

- `POST /auth/register` crea siempre usuarios `ASSISTANT` y exige un DOCTOR autenticado.
  Si se envía `clinicId`, el DOCTOR debe ser miembro de ese consultorio; si se omite, se usa
  el consultorio activo del token.
- La creación de `User` y `ClinicUser` es transaccional: si falla una, no queda la otra.
- `email` y `username` son únicos; un duplicado responde `409 CONFLICT`.
- Contraseña mínima: 8 caracteres, al menos una letra y un número.
- El body no acepta `role`; el rol creado es siempre `ASSISTANT`.
- El token caduca a los 7 días.
- El rol efectivo es el de la membresía (`ClinicUser`), no el de la cuenta.

---

## 3. Patients

Base: `/api/patients`.

| Método | Ruta | Rol | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/patients` | Cualquiera | `{data,pagination}` |
| `GET` | `/patients/autocomplete` | Cualquiera | `{data,pagination}` |
| `GET` | `/patients/:id` | Cualquiera | `{data}` |
| `GET` | `/patients/:id?includeInactive=true` | Cualquiera | `{data}` de un paciente inactivo |
| `GET` | `/patients/:id/medical-histories` | Cualquiera | `{data,pagination}` |
| `POST` | `/patients` | Cualquiera | `{status,message,data}` |
| `PUT` | `/patients/:id` | Cualquiera | `{status,message,data}` |
| `DELETE` | `/patients/:id` | DOCTOR | `{status,message,data}` con `isActive:false` |

- Filtros de listado: `search`, `gender`, `isActive` (default `true`).
- `GET /patients?isActive=false` lista inactivos.
- `GET /patients/:id` responde `404` si el paciente está inactivo, salvo
  `includeInactive=true`.
- `PUT /patients/:id` es parcial: acepta cualquier subconjunto de campos.
- `isActive` solo acepta `true`; sirve para reactivar sin pisar los demás campos.
- La cédula es única **por clínica**. Duplicado en create o update → `409 CONFLICT`.
- La misma cédula puede existir en dos clínicas distintas.
- Un segundo `DELETE` responde `404`.

---

## 4. Medical histories

Base: `/api/medical-histories`.

| Método | Ruta | Rol | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/medical-histories` | Cualquiera | `{data,pagination}` |
| `GET` | `/medical-histories/appointments` | Cualquiera | `{data,pagination}` |
| `GET` | `/medical-histories/appointments/:id` | Cualquiera | `{data}` |
| `GET` | `/medical-histories/patients/:id` | Cualquiera | `{data,pagination}` |
| `GET` | `/medical-histories/:id` | Cualquiera | `{data}` |
| `POST` | `/medical-histories` | DOCTOR | `{status,message,data}` |
| `POST` | `/medical-histories/:id/sign` | DOCTOR | `{status,message,data}` |
| `PUT` | `/medical-histories/:id` | DOCTOR | `{status,message,data}` |
| `DELETE` | `/medical-histories/:id` | DOCTOR | `{status,message,data}` con `deleted:true` |

### 4.1 Firma clínica

`POST /medical-histories/:id/sign`:

- Marca `signedAt` y `signedById`.
- Registra `AuditAction.SIGN`.
- Si ya estaba firmada devuelve `409 CONFLICT`.

### 4.2 Formulario de intake

`MedicalHistory.data` sigue siendo JSON libre para las respuestas del formulario. `templateSnapshot` conserva la definición de la plantilla al momento del guardado.

### 4.3 Historias borradas y plantilla

- `GET /medical-histories/:id`, `PUT`, `DELETE` y `sign` responden `404` si la historia
  tiene `deleted:true`.
- Un segundo `DELETE` responde `404`.
- `PUT /medical-histories/:id` acepta `templateId` como UUID opcional.
- Si `templateId` no existe o pertenece a otra clínica → `404 Plantilla no encontrada`.
- Crear una historia exige que el paciente esté activo.

---

## 5. Customize (plantillas y campos)

Base: `/api/customize`.

| Método | Ruta | Rol | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/customize` | Cualquiera | `{data,pagination}` |
| `GET` | `/customize/templates/:id` | Cualquiera | `{data}` con solo campos activos |
| `GET` | `/customize/fields` | Cualquiera | `{data,pagination}` |
| `GET` | `/customize/fields/:id` | Cualquiera | `{data}` |
| `GET` | `/customize/:id` (legacy) | Cualquiera | `{data}` |
| `POST` | `/customize/templates` | DOCTOR | `{status,message,data}` |
| `PUT` | `/customize/templates/:id` | DOCTOR | `{status,message,data}` |
| `DELETE` | `/customize/templates/:id` | DOCTOR | `{status,message,data}` |
| `POST` | `/customize/fields` | DOCTOR | `{status,message,data}` |
| `PUT` | `/customize/fields/:id` | DOCTOR | `{status,message,data}` |
| `DELETE` | `/customize/fields/:id` | DOCTOR | `{status,message,data}` |
| `PUT` | `/customize/fields/reorder` | DOCTOR | `{status,message,data}` |
| `PUT` | `/customize/reorder` (legacy) | DOCTOR | `{status,message,data}` |
| `POST` | `/customize` (legacy) | DOCTOR | `{status,message,data}` |
| `PUT` | `/customize/:id` (legacy) | DOCTOR | `{status,message,data}` |
| `DELETE` | `/customize/:id` (legacy) | DOCTOR | `{status,message,data}` |

`fieldType` es texto libre. `options` siempre es un array (`[]` si no aplica).
`GET /customize` y `GET /customize/templates/:id` solo devuelven `CustomField` con
`isActive:true`; los campos borrados no se renderizan en el formulario de consulta.

---

## 6. Providers

Base: `/api/providers`.

| Método | Ruta | Rol | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/providers` | Cualquiera | `{data,pagination}` |
| `POST` | `/providers` | DOCTOR | `{status,message,data}` |
| `PUT` | `/providers/:id` | DOCTOR | `{status,message,data}` |
| `DELETE` | `/providers/:id` | DOCTOR | `{status,message,data}` |
| `POST` | `/providers/:id/services` | DOCTOR | `{status,message,data}` |
| `PUT` | `/providers/services/:serviceId` | DOCTOR | `{status,message,data}` |
| `DELETE` | `/providers/services/:serviceId` | DOCTOR | `{status,message,data}` |

Todas las rutas filtran por el consultorio activo. `GET /providers` incluye `services`; el frontend debe filtrar `services.filter(s => s.isActive)`.
La identificación (`identify`) es única por clínica; un duplicado en create/update responde
`409 CONFLICT`. `PUT/DELETE /providers/:id` y `/providers/services/:serviceId` con un id de
otra clínica responden `404`.

---

## 7. Services costs y dólar

Base: `/api/services-costs`.

| Método | Ruta | Rol | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/services-costs` | Cualquiera | `{data,pagination}` |
| `GET` | `/services-costs/:id` | Cualquiera | `{data}` o `404 NOT_FOUND` |
| `POST` | `/services-costs` | DOCTOR | `{status,message,data}` |
| `PUT` | `/services-costs/:id` | DOCTOR | `{status,message,data}` |
| `DELETE` | `/services-costs/:id` | DOCTOR | `{status,message,data}` |
| `GET` | `/services-costs/dolar` | Cualquiera | `{data}` o `404 NOT_FOUND` |
| `POST` | `/services-costs/dolar` | DOCTOR | `{status,message,data}` |
| `POST` | `/services-costs/dolar/save` | DOCTOR | `{status,message,data}` — 1/min |

`GET /services-costs` filtra por `search`, `isActive` (por defecto `true`), `priceMin` y
`priceMax`. `GET/PUT/DELETE /services-costs/:id` filtran por la clínica activa y ocultan
los servicios inactivos: un segundo borrado o un id de otra clínica responde `404`.

### 7.1 Última tasa

`GET /services-costs/dolar` devuelve la fila con `date` más reciente y, en empate, la de `createdAt` más reciente. Si no hay tasas registradas devuelve `404 NOT_FOUND` con `message: "Tasa de dólar no disponible"`.

### 7.2 Guardar una tasa

`POST /services-costs/dolar`:

```json
{ "value": 36.5, "date": "2026-10-01T00:00:00.000Z" }
```

- La fecha se normaliza al día calendario UTC.
- Si ya existe una tasa con la misma fecha y valor, devuelve la existente con `message: "La tasa de dólar ya estaba registrada."` y no inserta un duplicado.
- Valores distintos para el mismo día sí se permiten; la última se resuelve por `date desc, createdAt desc`.

### 7.3 Captura automática

`POST /services-costs/dolar/save` consulta `ve.dolarapi.com`, normaliza y delega en el guardado manual. Si la API externa falla devuelve `502 UPSTREAM_ERROR`.

**Ya no existe `GET /services-costs/dolar/save`.** Un GET nunca escribe.

---

## 8. Quotes (presupuestos)

Base: `/api/quotes`. Contrato detallado para frontend:
[`docs/QUOTES_FRONTEND.md`](QUOTES_FRONTEND.md).

| Método | Ruta | Rol | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/quotes` | Cualquiera | `{data,pagination}` |
| `GET` | `/quotes/:id` | Cualquiera | `{data}` |
| `GET` | `/quotes/:id/versions` | Cualquiera | `{data}` con todas las versiones |
| `POST` | `/quotes` | Cualquiera | `{status,message,data}` |
| `PUT` | `/quotes/:id` | Cualquiera | `{status,message,data}` — solo `DRAFT` |
| `POST` | `/quotes/:id/revise` | Cualquiera | `{status,message,data}` — nueva versión |
| `PUT` | `/quotes/:id/send` | Cualquiera | `{status,message,data}` — `DRAFT → SENT` |
| `PUT` | `/quotes/:id/approve` | DOCTOR | `{status,message,data}` — `SENT → APPROVED` |
| `PUT` | `/quotes/:id/reject` | DOCTOR | `{status,message,data}` — `SENT → REJECTED` |
| `PUT` | `/quotes/:id/cancel` | Cualquiera | `DRAFT/SENT/APPROVED → CANCELLED` |
| `PUT` | `/quotes/:id/expire` | Cualquiera | `SENT/APPROVED → EXPIRED` |
| `DELETE` | `/quotes/:id` | DOCTOR | `{status,message,data}` con `isActive:false` |

### 8.1 Estados y versionado

`QuoteStatus`: `DRAFT`, `SENT`, `APPROVED`, `REJECTED`, `EXPIRED`, `CANCELLED`.

- Solo `DRAFT` se edita con `PUT`.
- `SENT` o superior es inmutable: para cambiarlo se usa `POST /quotes/:id/revise`.
- `revise` crea un `DRAFT` con `version + 1`, `supersedesId = id anterior`,
  `rootQuoteId = raíz de la cadena` y marca la versión anterior con `supersededAt`.
- `GET /quotes` devuelve por defecto solo la última versión (`supersededAt: null`).
  `includeSuperseded=true` incluye el historial.
- `DELETE` solo aplica a la última versión activa; una versión reemplazada responde `409`.

### 8.2 Totales y redondeo

El cliente **no envía `total`**; si lo envía, `forbidNonWhitelisted` responde `400`.

- `item.total = unitPrice × quantity`
- `subtotal = suma de item.total`
- `total = subtotal − discount + tax`
- Redondeo `HALF_UP` a 2 decimales por línea y luego en subtotal, descuento, impuesto y
  total.
- `discount` y `tax` son montos absolutos (no porcentajes), no negativos; el descuento no
  puede superar el subtotal.

### 8.3 Ítems y snapshots

- Ítem libre: requiere `name` y `unitPrice`.
- Ítem de catálogo: `serviceCostId` (costo de la clínica) o `providerServiceId` (servicio
  de un proveedor de la clínica), nunca ambos.
- Para ítems referenciados el servidor copia `name`, `description` y `unitPrice` del
  catálogo. Cambiar el precio del catálogo no altera presupuestos ya guardados.
- En `PUT` de un borrador, enviar `items` reemplaza todos los ítems en una transacción.

### 8.4 Validaciones

- Paciente de otra clínica o inactivo → `404`.
- `dolarId` inexistente → `404 Tasa de dólar no encontrada`.
- `paymentMethodId` de otra clínica o inactivo → `404`.
- `validUntil` anterior a `date` → `400`.
- `currency` debe ser ISO 4217 de 3 letras (`USD` por defecto).
- Todas las rutas filtran por `clinicId`; un id de otra clínica responde `404`.
- `GET /quotes?isActive=false` lista presupuestos inactivos.
- `PUT /quotes/:id` con `{isActive:true}` reactiva un presupuesto inactivo; no se puede
  enviar `isActive:false`.

---

## 9. Payment info

Base: `/api/payment-info`.

| Método | Ruta | Rol | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/payment-info` | Cualquiera | `{data,pagination}` |
| `POST` | `/payment-info` | DOCTOR | `{status,message,data}` |
| `PUT` | `/payment-info/:id` | DOCTOR | `{status,message,data}` |
| `DELETE` | `/payment-info/:id` | DOCTOR | `{status,message,data}` |

Todas las rutas filtran por el consultorio activo; `PUT/DELETE /payment-info/:id` con un id
de otra clínica responde `404`. `phone`, `email` y `account` son opcionales en el DTO pero
obligatorios en la base; enviar siempre los cinco campos.

---

## 10. Auditoría

Base: `/api/audit-logs`. Solo DOCTOR.

| Método | Ruta | Respuesta |
| --- | --- | --- |
| `GET` | `/audit-logs` | `{data,pagination}` |

Filtros: `entity`, `action` (`CREATE`, `UPDATE`, `DELETE`, `SIGN`), `userId`, `dateFrom`, `dateTo`, `page`, `limit`.

Cada registro contiene `userId`, `clinicId`, `entity`, `entityId`, `action`, `metadata`, `ipAddress`, `requestId` y `createdAt`. `metadata` solo guarda nombres de campos/estados, nunca contenido clínico ni datos personales.

Detalle en [`docs/AUDITORIA_DATOS.md`](AUDITORIA_DATOS.md).

---

## 11. Dashboard

Base: `/api/dashboard`.

| Método | Ruta | Rol | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/dashboard` | Cualquiera | `{data:{clinicId,generatedAt,timezone,patients,appointments,consultations,quotes}}` |
| `GET` | `/dashboard/agenda` | Cualquiera | `{data:{clinicId,generatedAt,timezone,today,upcoming}}` |

`GET /dashboard` devuelve el resumen. El consultorio se toma del token activo; no acepta
`clinicId` por query. Incluye:

- pacientes activos;
- citas de hoy y de los próximos 7 días;
- consultas del mes actual;
- presupuestos pendientes (`DRAFT`/`SENT`), aprobados (`APPROVED`) y total, con montos
  agrupados por moneda.

`GET /dashboard/agenda` lista la agenda de hoy y las próximas citas. Acepta `days`
(`1..31`, default `7`) y `limit` (`1..100`, default `20`). Devuelve los datos prácticos
de cada cita (fecha, duración, estado, tipo, canal, motivo y paciente) y `hasMore` cuando
la ventana futura supera el límite.

Los límites de día y mes se calculan en `America/Caracas`. No audita y no requiere
`METRICS_TOKEN`.

Detalle en [`docs/DASHBOARD.md`](DASHBOARD.md).

---

## 12. Métricas

`GET /api/metrics` devuelve formato Prometheus. Requiere el header `x-metrics-token` con el valor de `METRICS_TOKEN`; si la variable no está definida, responde `404 NOT_FOUND`.

Métricas principales:

- `http_requests_total{method,route,status}`
- `http_request_duration_seconds{method,route}` (histograma)
- `http_errors_total{method,route,status}`

Detalle en [`docs/OPERACION.md`](OPERACION.md).

---

## 13. Cambios rompientes para el frontend

1. Los GET de detalle ahora devuelven `{data}`; dejar de usar el objeto desnudo.
2. Los listados que devolvían arrays (`/patients/:id/medical-histories`, `/medical-histories/patients/:id`, `/auth/clinics`) ahora devuelven `{data,pagination}`.
3. `auth` y `/dolar` ya no usan `success`; usar `status`.
4. `GET /services-costs/dolar` devuelve `404` si no hay tasa; ya no hay cuerpo vacío.
5. `GET /services-costs/dolar/save` fue eliminado; usar `POST`.
6. Los errores traen `code` y `requestId`.
7. El ASSISTANT recibe `403` en acciones restringidas; el frontend debe ocultarlas según [`docs/PERMISOS.md`](PERMISOS.md).
8. `POST/PUT /quotes` ya no aceptan `total`; el servidor calcula `subtotal`, `discount`,
   `tax` y `total`. Enviar `total` responde `400`.
9. `Quote.status` pasó de texto libre a `DRAFT|SENT|APPROVED|REJECTED|EXPIRED|CANCELLED`.
   Los valores históricos `pending`/`approved` se migraron a `DRAFT`/`APPROVED`.
10. `GET /quotes` devuelve solo la última versión por defecto; usar
    `includeSuperseded=true` para el historial. Existen `GET /quotes/:id` y
    `GET /quotes/:id/versions`.

El repo `med-clinical` no fue modificado en esta pasada; este documento es el handoff.
