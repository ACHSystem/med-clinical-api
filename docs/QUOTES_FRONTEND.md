# Presupuestos y costos — contrato para frontend

Base: `/api` · Autenticación: `Authorization: Bearer <token>` · Roles: `DOCTOR`, `ASSISTANT`.

Este documento describe las rutas, payloads e interfaces de `quotes` y `services-costs`
tal como las expone la API. Los `Decimal` de Prisma se serializan como **string** en las
respuestas; en los requests se envían como **number** (excepto fechas, que son ISO 8601).

---

## 1. Envelopes y errores

### Escrituras

```ts
interface WriteResponse<T> {
  status: true;
  message: string;
  data: T;
}
```

### Detalle

```ts
interface DetailResponse<T> {
  data: T;
}
```

### Listas paginadas

```ts
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    totalElements: number;
    totalPages: number;
  };
}
```

### Error

```ts
interface ApiError {
  status: false;
  message: string;
  code: string;
  requestId: string;
}
```

| Código | Cuándo |
| --- | --- |
| `400` | Validación, `validUntil < date`, descuento mayor al subtotal, ítem libre incompleto, `total` enviado desde el cliente |
| `401` | Token ausente o inválido |
| `403` | ASSISTANT intentando aprobar, rechazar o borrar |
| `404` | Recurso inexistente, inactivo o de otra clínica |
| `409` | Editar un presupuesto no `DRAFT`, versión ya reemplazada, transición de estado inválida, borrar una versión no vigente |
| `429` | Rate limit |

---

## 2. Enums e interfaces compartidas

```ts
type QuoteStatus =
  | 'DRAFT'
  | 'SENT'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

type Role = 'ADMIN' | 'DOCTOR' | 'ASSISTANT';

interface PatientSummary {
  id: string;
  name: string;
  lastName: string;
  identify: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  gender: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  clinicId: string;
  createdAt: string;
  updatedAt: string;
}

interface Dolar {
  id: string;
  value: string; // Decimal serializado, ej. "36.50"
  date: string;
  createdAt: string;
  updatedAt: string;
}

interface PaymentMethod {
  id: string;
  bank: string;
  identify: string;
  phone: string;
  email: string;
  account: string;
  isActive: boolean;
  clinicId: string;
  createdAt: string;
  updatedAt: string;
}

interface QuoteVersionRef {
  id: string;
  version: number;
  status: QuoteStatus;
}

interface QuoteItem {
  id: string;
  name: string; // snapshot
  description: string | null; // snapshot
  quantity: number;
  unitPrice: string; // Decimal serializado, snapshot
  total: string; // Decimal serializado: unitPrice × quantity
  sortOrder: number;
  quoteId: string;
  serviceCostId: string | null;
  providerServiceId: string | null;
  createdAt: string;
}

interface Quote {
  id: string;
  title: string;
  description: string | null;
  date: string;
  validUntil: string | null;

  status: QuoteStatus;
  version: number;
  rootQuoteId: string | null; // primera versión de la cadena
  supersedesId: string | null; // versión anterior
  supersededAt: string | null; // != null => reemplazada
  isActive: boolean;

  currency: string; // ISO 4217, por defecto "USD"
  exchangeRate: string; // Decimal serializado: snapshot de Dolar.value
  dolarId: string;

  subtotal: string; // Decimal serializado
  discount: string; // Decimal serializado (monto, no porcentaje)
  tax: string; // Decimal serializado (monto, no porcentaje)
  total: string; // Decimal serializado: subtotal - discount + tax

  issuedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;

  patientId: string;
  patient: PatientSummary;
  clinicId: string;
  createdById: string;
  createdBy: { id: string; name: string; lastName: string };

  paymentMethodId: string | null;
  paymentMethod: PaymentMethod | null;

  dolar: Dolar;
  items: QuoteItem[];

  supersedes: QuoteVersionRef | null;
  supersededBy: QuoteVersionRef | null;

  createdAt: string;
  updatedAt: string;
}
```

> `supersedes` es la versión anterior; `supersededBy` es la versión nueva que reemplazó a
> esta. `rootQuoteId` apunta a la primera versión. En la primera versión,
> `rootQuoteId === id` y `supersedesId === null`.

---

## 3. Reglas de negocio que el frontend debe respetar

1. **El cliente nunca envía `total`.** No está en el DTO; enviarlo produce `400`.
2. **Solo `DRAFT` es editable.** `SENT`, `APPROVED`, `REJECTED`, `EXPIRED` y `CANCELLED`
   son inmutables. Para cambiarlos se llama a `/revise`.
3. **Lista por defecto = última versión.** `GET /quotes` oculta reemplazadas; usar
   `includeSuperseded=true` para el historial.
4. **Ítems referenciados**: el servidor ignora `name`, `description` y `unitPrice` del
   cliente y copia los del catálogo. Para mostrar el precio antes de guardar, consultar
   `GET /services-costs` o `GET /providers`.
5. **Ítems libres**: requieren `name` y `unitPrice`.
6. **Redondeo**: HALF_UP a 2 decimales por línea y luego en los agregados. No duplicar
   esta lógica en el frontend; mostrar los valores que devuelve el servidor.
7. **Fechas**: `validUntil >= date`. Ambas ISO 8601.
8. **Moneda**: `currency` ISO 4217 de 3 letras; por defecto `USD`.
9. **`discount` y `tax`** son montos absolutos, no porcentajes.

### Transiciones de estado

| Acción | Ruta | Desde | Hacia | Rol |
| --- | --- | --- | --- | --- |
| Emitir | `PUT /quotes/:id/send` | `DRAFT` | `SENT` | Cualquiera |
| Aprobar | `PUT /quotes/:id/approve` | `SENT` | `APPROVED` | DOCTOR |
| Rechazar | `PUT /quotes/:id/reject` | `SENT` | `REJECTED` | DOCTOR |
| Cancelar | `PUT /quotes/:id/cancel` | `DRAFT`, `SENT`, `APPROVED` | `CANCELLED` | Cualquiera |
| Vencer | `PUT /quotes/:id/expire` | `SENT`, `APPROVED` | `EXPIRED` | Cualquiera |
| Revisar | `POST /quotes/:id/revise` | Cualquier versión vigente | Nueva `DRAFT` | Cualquiera |

---

## 4. Rutas de presupuestos

### 4.1 `GET /quotes`

Lista paginada.

**Query params**

```ts
interface QuoteListQuery {
  page?: number; // default 1
  limit?: number; // default 50, max 100
  search?: string; // título, descripción, nombre/apellido del paciente
  status?: QuoteStatus;
  patientId?: string; // UUID
  paymentMethodId?: string; // UUID
  currency?: string; // ISO 4217
  isActive?: boolean; // default true
  includeSuperseded?: boolean; // default false
  createdFrom?: string; // ISO date
  createdTo?: string; // ISO date
}
```

**Respuesta**

```ts
type GetQuotesResponse = PaginatedResponse<Quote>;
```

---

### 4.2 `GET /quotes/:id`

Detalle de una versión concreta (incluye versiones reemplazadas si se pide por id).

```ts
type GetQuoteResponse = DetailResponse<Quote>;
```

---

### 4.3 `GET /quotes/:id/versions`

Todas las versiones de la cadena, ordenadas por `version` ascendente.

```ts
type GetQuoteVersionsResponse = DetailResponse<Quote[]>;
```

---

### 4.4 `POST /quotes`

Crea un presupuesto. Todo ocurre en una transacción.

**Payload**

```ts
interface QuoteItemPayload {
  // Referencia al catálogo (opcional):
  serviceCostId?: string; // UUID de ServiceCost de la clínica
  providerServiceId?: string; // UUID de ProviderService de la clínica

  // Para ítems libres:
  name?: string; // obligatorio si no hay serviceCostId/providerServiceId
  unitPrice?: number; // obligatorio si no hay serviceCostId/providerServiceId

  // Comunes:
  description?: string;
  quantity?: number; // default 1, entero >= 1
  sortOrder?: number; // default: índice del array
}

interface CreateQuotePayload {
  title: string;
  description?: string;
  date?: string; // ISO; default now
  validUntil?: string; // ISO; debe ser >= date

  currency?: string; // ISO 4217; default "USD"
  dolarId: string; // UUID de una tasa existente
  paymentMethodId?: string; // UUID de un método de la clínica

  discount?: number; // monto >= 0, default 0
  tax?: number; // monto >= 0, default 0

  status?: 'DRAFT' | 'SENT'; // default DRAFT

  patientId: string; // UUID de paciente activo de la clínica
  items: QuoteItemPayload[]; // al menos 1
}
```

**Ejemplo con ítem libre y ítem de catálogo**

```json
{
  "title": "Presupuesto control de hipertensión",
  "description": "Consultas y laboratorio",
  "date": "2026-10-28T00:00:00.000Z",
  "validUntil": "2026-11-28T00:00:00.000Z",
  "currency": "USD",
  "dolarId": "8f10f0de-1111-4222-8333-444455556666",
  "paymentMethodId": "7c7c7c7c-1111-4222-8333-444455556666",
  "discount": 10,
  "tax": 16,
  "patientId": "0b0b0b0b-1111-4222-8333-444455556666",
  "items": [
    {
      "serviceCostId": "1a1a1a1a-1111-4222-8333-444455556666",
      "quantity": 2
    },
    {
      "name": "Cargo administrativo",
      "description": "Ítem libre",
      "quantity": 1,
      "unitPrice": 25
    }
  ]
}
```

> No enviar `total` ni `subtotal`. El servidor calcula `item.total`, `subtotal`, `total`,
> guarda el snapshot de moneda/tasa y setea `issuedAt` si `status === "SENT"`.

**Respuesta**

```ts
type CreateQuoteResponse = WriteResponse<Quote>;
```

---

### 4.5 `PUT /quotes/:id`

Edita un borrador. Solo `DRAFT`.

**Payload** (todos opcionales)

```ts
interface UpdateQuotePayload {
  title?: string;
  description?: string;
  date?: string;
  validUntil?: string;
  currency?: string;
  dolarId?: string;
  paymentMethodId?: string;
  discount?: number;
  tax?: number;
  items?: QuoteItemPayload[]; // si se envía, reemplaza TODOS los ítems
  isActive?: true; // solo reactivación de un presupuesto dado de baja
}
```

- Enviar `items` reemplaza el set completo en una transacción.
- `isActive: true` solo se acepta para reactivar; no se puede combinar con otros campos.
- `isActive: false` no se acepta (usar `DELETE`).
- Si el presupuesto está `SENT` o superior → `409`.

**Respuesta**

```ts
type UpdateQuoteResponse = WriteResponse<Quote>;
```

---

### 4.6 `POST /quotes/:id/revise`

Crea una nueva versión `DRAFT` copiando ítems y datos de la versión actual.

- Sin body.
- La versión anterior queda con `supersededAt` no nulo.
- Nueva versión: `version = anterior.version + 1`, `supersedesId = anterior.id`,
  `rootQuoteId = raíz`.
- Si la versión ya fue reemplazada → `409`.

```ts
type ReviseQuoteResponse = WriteResponse<Quote>;
```

---

### 4.7 Acciones de estado

Todas sin body. Responden `WriteResponse<Quote>`.

| Ruta | Transición |
| --- | --- |
| `PUT /quotes/:id/send` | `DRAFT → SENT` |
| `PUT /quotes/:id/approve` | `SENT → APPROVED` (DOCTOR) |
| `PUT /quotes/:id/reject` | `SENT → REJECTED` (DOCTOR) |
| `PUT /quotes/:id/cancel` | `DRAFT/SENT/APPROVED → CANCELLED` |
| `PUT /quotes/:id/expire` | `SENT/APPROVED → EXPIRED` |

---

### 4.8 `DELETE /quotes/:id`

Baja lógica (`isActive: false`) de la última versión activa. Solo DOCTOR.

- Si la versión fue reemplazada → `409`.
- Si ya está inactiva → `404`.

```ts
type DeleteQuoteResponse = WriteResponse<Quote>;
```

---

## 5. Rutas de costos y servicios

### 5.1 `GET /services-costs`

```ts
interface ServiceCostListQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean; // default true
  priceMin?: number;
  priceMax?: number;
}

interface ServiceCost {
  id: string;
  name: string;
  description: string;
  price: string; // Decimal serializado
  isActive: boolean;
  clinicId: string;
  createdAt: string;
  updatedAt: string;
}

type GetServiceCostsResponse = PaginatedResponse<ServiceCost>;
```

### 5.2 `GET /services-costs/:id`

```ts
type GetServiceCostResponse = DetailResponse<ServiceCost>;
```

`404` si no existe, está inactivo o pertenece a otra clínica.

### 5.3 `POST /services-costs` (DOCTOR)

```ts
interface CreateServiceCostPayload {
  name: string;
  description?: string;
  price: number; // >= 0
}
```

### 5.4 `PUT /services-costs/:id` (DOCTOR)

Mismo payload completo que `POST`.

### 5.5 `DELETE /services-costs/:id` (DOCTOR)

Baja lógica. Segundo borrado → `404`.

### 5.6 `GET /services-costs/dolar`

Última tasa registrada. `404` si no existe ninguna.

```ts
type GetCurrentDolarResponse = DetailResponse<Dolar>;
```

### 5.7 `POST /services-costs/dolar` (DOCTOR)

```ts
interface SaveDolarPayload {
  value: number;
  date: string; // ISO 8601
}

type SaveDolarResponse = WriteResponse<Dolar>;
```

La fecha se normaliza al día calendario UTC. Si ya existe la misma fecha + valor, devuelve
la fila existente sin duplicar.

### 5.8 `POST /services-costs/dolar/save` (DOCTOR)

Sin body. Consulta `ve.dolarapi.com`, guarda la tasa y responde `WriteResponse<Dolar>`.
Rate limit: 1 request por minuto. Si el proveedor externo falla → `502`.

---

## 6. Catálogo de proveedores para `providerServiceId`

Para poblar ítems referenciados a un servicio de proveedor:

- `GET /providers` devuelve cada proveedor con `services: ProviderService[]`.
- El frontend debe filtrar `services.filter(s => s.isActive)`.
- `ProviderService`:

```ts
interface Provider {
  id: string;
  name: string;
  type: string;
  businessName: string;
  identify: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  description: string | null;
  isActive: boolean;
  clinicId: string;
  services: ProviderService[];
  createdAt: string;
  updatedAt: string;
}

interface ProviderService {
  id: string;
  name: string;
  description: string | null;
  price: string; // Decimal serializado
  isActive: boolean;
  providerId: string;
  createdAt: string;
  updatedAt: string;
}

type GetProvidersResponse = PaginatedResponse<Provider>;
```

---

## 7. Rutas auxiliares del flujo

```ts
// Paciente del presupuesto.
// GET /patients/:id
type GetPatientResponse = DetailResponse<PatientSummary>;

// Métodos de pago de la clínica.
// GET /payment-info?page=1&limit=50&search=...
type GetPaymentMethodsResponse = PaginatedResponse<PaymentMethod>;
```

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/patients/:id` | Cargar paciente antes de crear el presupuesto |
| `GET` | `/services-costs/dolar` | Obtener `dolarId` y `exchangeRate` vigente |
| `GET` | `/payment-info` | Poblar selector de método de pago |
| `GET` | `/services-costs` | Poblar ítems de catálogo propio |
| `GET` | `/providers` | Poblar `providerServiceId` |

---

## 8. Flujo recomendado en el frontend

1. Cargar paciente (`GET /patients/:id`), tasa (`GET /services-costs/dolar`) y métodos de
   pago (`GET /payment-info`).
2. Cargar catálogos: `GET /services-costs` y `GET /providers`.
3. Crear borrador con `POST /quotes`:
   - `status: "DRAFT"` para guardar.
   - `status: "SENT"` para emitir de inmediato.
4. Editar mientras `status === "DRAFT"` con `PUT /quotes/:id`.
5. Emitir con `PUT /quotes/:id/send` si se creó como borrador.
6. Para modificar un presupuesto emitido: `POST /quotes/:id/revise` y editar la nueva
   versión `DRAFT`.
7. Listar con `GET /quotes` (última versión) y consultar historial con
   `GET /quotes/:id/versions`.

### Checklist de UI

- Ocultar botón editar si `status !== 'DRAFT'`.
- Mostrar botón "Revisar" para versiones vigentes.
- Mostrar aprobar/rechazar solo a DOCTOR y solo si `status === 'SENT'`.
- Mostrar borrar solo a DOCTOR.
- No calcular totales localmente para persistir; sí se puede previsualizar, pero el valor
  autoritativo es el del servidor.
- Formatear `Decimal` string con `Intl.NumberFormat` usando `quote.currency`.
