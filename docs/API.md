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

`patients`, `medical-histories`, `quotes`, `providers`, `services-costs`, `payment-info` y `customize` se filtran por el consultorio activo del token en lecturas y escrituras. Acceder a un recurso de otra clínica devuelve `404`.

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
| `GET` | `/patients/:id/medical-histories` | Cualquiera | `{data,pagination}` |
| `POST` | `/patients` | Cualquiera | `{status,message,data}` |
| `PUT` | `/patients/:id` | Cualquiera | `{status,message,data}` |
| `DELETE` | `/patients/:id` | DOCTOR | `{status,message,data}` con `isActive:false` |

Filtros de listado: `search`, `gender`. El borrado es lógico.

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

---

## 5. Customize (plantillas y campos)

Base: `/api/customize`.

| Método | Ruta | Rol | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/customize` | Cualquiera | `{data,pagination}` |
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

---

## 7. Services costs y dólar

Base: `/api/services-costs`.

| Método | Ruta | Rol | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/services-costs` | Cualquiera | `{data,pagination}` |
| `POST` | `/services-costs` | DOCTOR | `{status,message,data}` |
| `PUT` | `/services-costs/:id` | DOCTOR | `{status,message,data}` |
| `DELETE` | `/services-costs/:id` | DOCTOR | `{status,message,data}` |
| `GET` | `/services-costs/dolar` | Cualquiera | `{data}` o `404 NOT_FOUND` |
| `POST` | `/services-costs/dolar` | DOCTOR | `{status,message,data}` |
| `POST` | `/services-costs/dolar/save` | DOCTOR | `{status,message,data}` — 1/min |

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

Base: `/api/quotes`.

| Método | Ruta | Rol | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/quotes` | Cualquiera | `{data,pagination}` con `patient` e `items` |
| `POST` | `/quotes` | Cualquiera | `{status,message,data}` |
| `PUT` | `/quotes/:id` | Cualquiera | `{status,message,data}` |
| `DELETE` | `/quotes/:id` | DOCTOR | `{status,message,data}` con `isActive:false` |

- `Quote.total` lo envía el cliente; el servidor no lo recalcula.
- Cada `QuoteItem.total` lo calcula el servidor (`unitPrice × quantity`).
- `dolarId` debe existir; un id inválido produce `500 INTERNAL_ERROR` (validar en el cliente).
- No existe `GET /quotes/:id`.

---

## 9. Payment info

Base: `/api/payment-info`.

| Método | Ruta | Rol | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/payment-info` | Cualquiera | `{data,pagination}` |
| `POST` | `/payment-info` | DOCTOR | `{status,message,data}` |
| `PUT` | `/payment-info/:id` | DOCTOR | `{status,message,data}` |
| `DELETE` | `/payment-info/:id` | DOCTOR | `{status,message,data}` |

Todas las rutas filtran por el consultorio activo. `phone`, `email` y `account` son
opcionales en el DTO pero obligatorios en la base; enviar siempre los cinco campos.

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

## 11. Métricas

`GET /api/metrics` devuelve formato Prometheus. Requiere el header `x-metrics-token` con el valor de `METRICS_TOKEN`; si la variable no está definida, responde `404 NOT_FOUND`.

Métricas principales:

- `http_requests_total{method,route,status}`
- `http_request_duration_seconds{method,route}` (histograma)
- `http_errors_total{method,route,status}`

Detalle en [`docs/OPERACION.md`](OPERACION.md).

---

## 12. Cambios rompientes para el frontend

1. Los GET de detalle ahora devuelven `{data}`; dejar de usar el objeto desnudo.
2. Los listados que devolvían arrays (`/patients/:id/medical-histories`, `/medical-histories/patients/:id`, `/auth/clinics`) ahora devuelven `{data,pagination}`.
3. `auth` y `/dolar` ya no usan `success`; usar `status`.
4. `GET /services-costs/dolar` devuelve `404` si no hay tasa; ya no hay cuerpo vacío.
5. `GET /services-costs/dolar/save` fue eliminado; usar `POST`.
6. Los errores traen `code` y `requestId`.
7. El ASSISTANT recibe `403` en acciones restringidas; el frontend debe ocultarlas según [`docs/PERMISOS.md`](PERMISOS.md).

El repo `med-clinical` no fue modificado en esta pasada; este documento es el handoff.
