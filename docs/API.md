# API — med-clinical-api

Documento de integración para el frontend (Angular `med-clinical`). Describe el contrato
real, verificado contra la API en ejecución, no el intentions del código.

- **Base URL local:** `http://localhost:3000/api`
- **Prefijo:** todas las rutas empiezan por `/api`
- **Formato:** `Content-Type: application/json` en peticiones con cuerpo
- **Autenticación:** `Authorization: Bearer <access_token>` en todas las rutas salvo `POST /api/auth/login`
- **Credenciales de arranque del seed:** `doctor@medclinical.com` / `password123` (solo desarrollo)

---

## 1. Convenciones globales

### 1.1 Envolturas de respuesta (no son uniformes)

| Tipo de endpoint | Forma de la respuesta |
| --- | --- |
| `GET` de lista paginada | `{ "data": [...], "meta": { "page", "limit", "total", "totalPages" } }` |
| `GET` de detalle | **Objeto desnudo**: `{...}` — sin `{ data }` |
| `POST` / `PUT` / `DELETE` | `{ "status": true, "message": "...", "data": {...} }` |
| `/auth/login`, `/auth/register` | `{ "success": true, "message": "...", "data": {...} }` |
| `/services-costs/dolar*` | `{ "success": true, "message": "...", "data": {...} }` |
| `GET /auth/profile` | **Objeto desnudo** (no va envuelto) |

Las listas de pacientes, historiales por paciente, presupuestos, proveedores, costos,
métodos de pago y campos personalizados aceptan `page` (default `1`), `limit` (default
`20`, máximo `100`) y `search`. `search` ignora mayúsculas/minúsculas. La respuesta es:

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

> La distinción es `status` frente a `success`. Un interceptor de Angular que solo
> compruebe `status` ROMPE el login. Lo seguro es: si hay `data` úsala, y comprueba
> `res.status === true || res.success === true` para los endpoints de escritura.

### 1.2 Errores

Todos los errores usan la misma envoltura, sin `data`:

```json
{ "status": false, "message": "Paciente no encontrado" }
```

| Código | Cuándo | `message` |
| --- | --- | --- |
| `400` | Faltan campos, tipos inválidos o campos no declarados | `Errores de validación: …` |
| `401` | Sin token | `Token no enviado` |
| `401` | Token con firma inválida / expirado / mal formado | `Token inválido o expirado` |
| `401` | Credenciales incorrectas | `Credenciales inválidas` |
| `401` | Cuenta desactivada | `Usuario inactivo` |
| `401` | Email duplicado en registro | `El email ya está registrado` (es `400`, no `401`) |
| `404` | No existe o pertenece a otra clínica | `Paciente no encontrado`, `Historia no encontrada`, `Presupuesto no encontrado`, `Proveedor no encontrado`, `Servicio no encontrado`, `Campo no encontrado`, `Información de pago no encontrada` |
| `429` | Límite de peticiones excedido | `Too Many Requests` |
| `500` | Error no controlado | `Error interno del servidor` |

**Los mensajes de validación vienen en inglés** (los produce `class-validator`), aunque
el resto de la API esté en español:

```
Errores de validación: lastName should not be empty, lastName must be a string; identify should not be empty
```

No los parses: muéstralos tal cual o tradúcelos en el frontend.

### 1.3 Reglas de tipos que rompen código si se ignoran

1. **Los `Decimal` viajan como STRING.** `price`, `total`, `unitPrice`, `value` (dólar)
   se serializan a `"500"`, nunca a `500`. Toda operación aritmética exige
   `parseFloat(x)` primero, y el valor a enviar en la API es un **número JSON**.
2. **Las fechas son ISO 8601 en UTC:** `"1985-03-15T00:00:00.000Z"`. Los campos
   `birthDate`, `validUntil` y `date` se reciben como string ISO en la API.
3. **`null` es posible en `Patient.notes`, `email`, `phone`, `birthDate`, `gender`,
   `address`**, aunque el formulario los pida. Usa `| null` en tus tipos y
   `field ?? ''` en los formularios.
4. **No hay `PATCH`.** Solo `PUT`.
5. **`PUT` no es parcial** salvo donde se indica: los DTO de `providers`, `provider-services`,
   `services-costs` y `payment-info` exigen los campos obligatorios, así que un `PUT`
   debe reenviar el objeto completo. `PUT /patients/:id`, `PUT /quotes/:id`,
   `PUT /medical-histories/:id` y `PUT /customize/:id` sí aceptan objetos parciales.
6. **Campos no declarados → `400`.** El `ValidationPipe` usa `forbidNonWhitelisted`:
   mandar un campo de más es un error, no se ignora en silencio.
7. **Cuerpo máximo 100 kB** (límite por defecto de Nest).

### 1.4 Límites de peticiones (por IP)

| Ámbito | Límite |
| --- | --- |
| Global | 100 req/min |
| `POST /auth/login`, `POST /auth/register` | 5 req/min |
| `GET /services-costs/dolar/save` | 1 req/min |

Los contadores viven **en memoria**: se reinician al reiniciar el servidor y no se
comparten entre instancias. En el login, los 5 primeros intentos del minuto pasan y el
sexto responde `429`; el límite se reabre 60 s después del primero de la ventana.

### 1.5 Alcance por clínica (multitenancy)

`patients`, `medical-histories` y `quotes` están filtrados por la clínica activa del
token **en lecturas y escrituras**: pedir un recurso de otra clínica
devuelve `404`, nunca `403`, y nunca se puede escribir sobre un paciente ajeno.

Los listados de `services-costs` y `payment-info` se filtran por el consultorio activo.
Sus rutas de actualización y eliminación aún no filtran por clínica. El dólar es global.

 

### 1.6 CORS

Solo los orígenes de `CORS_ORIGINS` (por defecto `http://localhost:4200`) aceptan
respuestas; el resto no reciben `Access-Control-Allow-Origin`.

---

## 2. Interfaces TypeScript

Copia este bloque en el frontend y ajusta lo que necesites.

```ts
// ---------- Envolturas ----------
export interface ApiWriteOk<T> { status: true; message: string; data: T; }
export interface ApiAuthOk<T>  { success: true; message: string; data: T; }
export interface ApiError      { status: false; message: string; }

// ---------- Auth ----------
export type Role = 'DOCTOR' | 'ASSISTANT';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
export interface LoginResponse { access_token: string; user: AuthUser; }

export interface RegisterRequest  { email: string; password: string; name: string; lastName: string; }
export interface RegisterResponse { access_token: string; user: AuthUser; } // el rol siempre es ASSISTANT

/** Claims del JWT: { sub, email, role, iat, exp } — `sub` es el userId. Caduca a los 7 días. */
export interface JwtPayload { sub: string; email: string; role: Role; iat: number; exp: number; }

// ---------- Pacientes ----------
export interface Patient {
  id: string;
  clinicId: string;
  name: string;
  lastName: string;
  identify: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;   // ISO 8601 UTC
  gender: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;          // ISO 8601 UTC
  updatedAt: string;
}

export interface CreatePatientRequest {
  name: string;        // obligatorio, no vacío
  lastName: string;    // obligatorio, no vacío
  identify: string;    // obligatorio, no vacío
  email?: string;      // opcional, DEBE ser email válido si viene
  phone?: string;
  birthDate?: string;  // opcional, ISO 8601
  gender?: string;
  address?: string;
  notes?: string;
}

export interface UpdatePatientRequest {
  name?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  gender?: string;
  address?: string;
  notes?: string;
  isActive?: boolean;
  // IMPOSIBLE cambiar lastName e identify: no existen en el DTO de actualización.
}

// ---------- Historias médicas ----------
export interface MedicalHistory {
  id: string;
  title: string;
  type: string;
  reason: string;
  symptoms: string;
  notes: string;
  observations: string;
  diagnosis: string;
  evaluation: string;
  date: string;                   // ISO 8601 UTC
  status: string;
  vitalSigns: Record<string, unknown> | null;
  data: Record<string, unknown> | null;  // respuestas JSON del formulario
  templateId: string | null;
  templateSnapshot: Record<string, unknown> | null;
  patientId: string;
  clinicId: string;
  createdById: string;
  deleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MedicalHistoryListItem {
  id: string;
  title: string;
  type: string;
  date: string;
  createdAt: string;
  patient: Pick<Patient, 'id' | 'name' | 'lastName' | 'identify'>;
}

export interface MedicalHistoryTemplate {
  id: string;
  name: string;
  condition: string | null;
  description: string | null;
  type: string | null;
  isActive: boolean;
  clinicId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Medication {
  id: string;
  name: string;
  activeIngredient: string | null;
  presentation: string | null;
  concentration: string | null;
  form: string | null;
  notes: string | null;
  clinicId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentMedication {
  id: string;
  medicalTreatmentId: string;
  medicationId: string | null;
  medicationName: string;
  activeIngredient: string | null;
  presentation: string | null;
  concentration: string | null;
  dose: string;
  frequency: string;
  route: string | null;
  duration: string | null;
  quantity: string | null;
  instructions: string | null;
  notes: string | null;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
  clinicId: string | null;
  createdAt: string;
  updatedAt: string;
  medication: Medication | null;
}

export interface MedicalTreatment {
  id: string;
  medicalHistoryId: string;
  clinicId: string;
  title: string | null;
  plan: string | null;
  recommendations: string | null;
  notes: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  medicationId: string | null;
  createdAt: string;
  updatedAt: string;
  treatmentMedications: TreatmentMedication[];
}

export interface MedicalHistoryWithRelations extends MedicalHistory {
  patient: Patient;
  template: MedicalHistoryTemplate | null;
  medicalTreatments: MedicalTreatment[];
}

export interface CreateMedicalHistoryRequest {
  patientId: string;                       // obligatorio, UUID
  title: string;                           // obligatorio, no vacío
  type: string;                            // obligatorio, no vacío
  reason: string;
  symptoms: string;
  notes: string;
  observations: string;
  diagnosis: string;
  evaluation: string;
  date: string;                            // obligatorio, ISO 8601
  status: string;                          // obligatorio, no vacío
  vitalSigns?: Record<string, unknown>;    // objeto JSON opcional
  data?: Record<string, unknown>;          // objeto JSON opcional; respuestas del intake
  templateId?: string;                     // UUID opcional de plantilla
  templateSnapshot?: Record<string, unknown>;
}

export interface UpdateMedicalHistoryRequest {
  title?: string;
  data?: Record<string, unknown>;
  notes?: string;
  templateId?: string;
}

// ---------- Campos personalizados (formulario dinámico) ----------
export interface FormTemplate {
  id: string;
  clinicId: string;
  name: string;
  condition: string | null;
  description: string | null;
  type: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  fields?: CustomField[];
}

export interface CustomField {
  id: string;
  templateId: string;
  name: string;          // etiqueta del campo
  fieldType: string;      // ver §5.3 — string libre, NO es un enum
  isRequired: boolean;
  options: string[];     // valores para select / checkbox múltiple; [] si no aplica
  sortOrder: number;     // orden DENTRO del step
  step: number;          // número de paso/página del formulario (1 por defecto)
  unit: string | null;
  helpText: string | null;
  placeholder: string | null;
  minValue: number | null;
  maxValue: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomFieldRequest {
  templateId?: string;   // si se omite, usa/crea "General"
  name: string;
  fieldType: string;
  sortOrder: number;     // obligatorio, NÚMERO (no string)
  step: number;          // obligatorio, NÚMERO
  isRequired?: boolean;
  options?: string[];    // array de strings
  unit?: string;
  helpText?: string;
  placeholder?: string;
  minValue?: number;
  maxValue?: number;
}

export interface UpdateCustomFieldRequest {
  name?: string;
  fieldType?: string;
  isRequired?: boolean;
  options?: string[];
  sortOrder?: number;
  step?: number;
  unit?: string;
  helpText?: string;
  placeholder?: string;
  minValue?: number;
  maxValue?: number;
  isActive?: boolean;
}

export interface CreateFormTemplateRequest {
  name: string;
  condition?: string;
  description?: string;
  type?: string;
  fields?: CreateTemplateFieldRequest[];
}

export type CreateTemplateFieldRequest = Omit<CreateCustomFieldRequest, 'templateId'> & {
  id?: string; // ID existente: se reutiliza y reasigna a esta plantilla
};

export interface UpdateFormTemplateRequest {
  name?: string;
  condition?: string;
  description?: string;
  type?: string;
  isActive?: boolean;
}

/** Petición de reordenación; todos los campos deben ser de una misma plantilla. */
export interface ReorderCustomField { id: string; sortOrder: number; step: number; }

// ---------- Proveedores ----------
export interface ProviderService {
  id: string;
  name: string;
  description: string | null;
  price: string;         // DECIMAL como string
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  providerId: string;
}

export interface Provider {
  id: string;
  clinicId: string;
  name: string;
  type: string;          // string libre, p. ej. "Laboratorio", "Transportación"
  businessName: string;
  identify: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  services: ProviderService[];  // ¡incluye los inactivos! filtrar por isActive
}

export interface CreateProviderRequest {
  name: string;
  type: string;
  businessName: string;
  identify: string;
  email?: string;
  phone?: string;
  address?: string;
  description?: string;
}

export interface CreateProviderServiceRequest {
  name: string;
  price: number;         // NÚMERO al enviar; vuelve como string
  description?: string;
}

// ---------- Costos de servicio ----------
export interface ServiceCost {
  id: string;
  name: string;
  description: string;
  price: string;         // DECIMAL como string
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceCostRequest {
  name: string;
  description?: string;  // si se omite se guarda ""
  price: number;         // NÚMERO al enviar
}

// ---------- Métodos de pago ----------
export interface PaymentMethod {
  id: string;
  clinicId: string;
  bank: string;
  identify: string;
  phone: string;
  email: string;
  account: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

 

export interface CreatePaymentMethodRequest {
  bank: string;
  identify: string;
  phone?: string;        // opcional en la validación, obligatorio en la BD
  email?: string;        // opcional en la validación, obligatorio en la BD
  account?: string;      // opcional en la validación, obligatorio en la BD
}

export interface Dolar {
  id: string;
  value: string;         // DECIMAL como string
  date: string;          // ISO 8601
  createdAt: string;
  updatedAt: string;
}

// ---------- Presupuestos ----------
export interface QuoteItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: string;     // DECIMAL como string
  total: string;         // DECIMAL como string, lo calcula el servidor
  createdAt: string;
  quoteId: string;
}

export interface Quote {
  id: string;
  title: string;
  description: string | null;
  date: string;              // ISO, la pone el servidor
  validUntil: string | null; // ISO
  dolarId: string;           // referencia al snapshot de dólar usado
  total: string;             // DECIMAL como string — LO CALCULA EL CLIENTE
  status: string;            // "pending" por defecto; string libre
  isActive: boolean;
  patientId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  patient: Patient;          // incluido en las respuestas de quotes
  items: QuoteItem[];        // incluido en las respuestas de quotes
}

export interface CreateQuoteItemRequest {
  name: string;
  unitPrice: number;    // NÚMERO al enviar
  description?: string;
  quantity?: number;    // si se omite se guarda 1
}

export interface CreateQuoteRequest {
  title: string;
  total: number;        // NÚMERO — el servidor NO lo recalcula desde los items
  dolarId: string;      // id de GET /services-costs/dolar (o del histórico guardado)
  patientId: string;    // DEBE ser UUID y pertenecer a la clínica
  description?: string;
  validUntil?: string;  // ISO 8601
  items: CreateQuoteItemRequest[];  // obligatorio (puede ser [])
}

export interface UpdateQuoteRequest {
  title?: string;
  description?: string;
  validUntil?: string;  // ISO 8601
  total?: number;       // NÚMERO
  status?: string;
  isActive?: boolean;
  // los items NO se pueden editar por esta ruta
}
```

---

## 3. Módulo Auth

Base: `/api/auth`. Es el único módulo con límite de 5 req/min.

| Método | Ruta | Auth | Body | Respuesta |
| --- | --- | --- | --- | --- |
| `POST` | `/auth/login` | **No** | `LoginRequest` | `201 { success, message, data: LoginResponse }` |
| `POST` | `/auth/register` | **Sí** | `RegisterRequest` | `201 { success, message, data: RegisterResponse }` |
| `GET` | `/auth/profile` | Sí | — | `200 AuthUser` (objeto desnudo) |

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor@medclinical.com","password":"password123"}'
```

```json
{
  "success": true,
  "message": "Bienvenido Juan",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "user": { "id": "...", "email": "doctor@medclinical.com", "name": "Juan", "role": "DOCTOR" }
  }
}
```

**Detalles importantes**

- `POST /register` **exige un token válido**. No es un registro público: sirve para que un
  doctor dé de alta asistentes. Si no envías el token responde `401 Token no enviado`.
- El usuario creado por `register` siempre nace con `role: "ASSISTANT"`. No se puede
  crear un `DOCTOR` por la API: el primero viene del seed.
- `password` exige **mínimo 6 caracteres** solo en `register`. En `login` se acepta
  cualquier string no vacío.
- El token **caduca a los 7 días** (`exp`). No hay refresh token: al expirar, el
  frontend debe volver a hacer login.
- `GET /auth/profile` no viene envuelto; devuelve el usuario directamente.
- `role` existe pero **no autoriza nada**: `DOCTOR` y `ASSISTANT` tienen exactamente los
  mismos permisos.

---

## 4. Módulo Patients

Base: `/api/patients`. Todo filtrado por clínica.

| Método | Ruta | Body | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/patients` | Query: `page`, `limit`, `search`, `gender`, `isActive`, `createdFrom`, `createdTo` | `200 { data: Patient[], meta }` |
| `GET` | `/patients/:id/medical-histories` | — | `200 MedicalHistory[]` con paciente, plantilla, tratamientos e indicaciones · `404` si el paciente no es de tu clínica |
| `GET` | `/patients/:id` | — | `200 Patient` · `404` |
| `POST` | `/patients` | `CreatePatientRequest` (requiere Bearer token; `clinicId` se toma del consultorio activo) | `201 { status, message, data: Patient }` |
| `PUT` | `/patients/:id` | `UpdatePatientRequest` | `200 { status, message, data: Patient }` |
| `DELETE` | `/patients/:id` | — | `200 { status, message, data: Patient }` |

**Filtros y orden**

- `search` busca por nombre, apellido, identificación, email o teléfono; `gender` filtra
  por sexo; `isActive` permite incluir activos (`true`, default) o inactivos (`false`).
- `createdFrom` y `createdTo` filtran `createdAt` (ISO 8601). Se restringe por el
  consultorio activo del token y se ordena por `createdAt` descendente.
- `GET /patients/:id` **no** filtra por `isActive`: un paciente borrado (soft delete)
  sigue siendo obtenible por id, aunque no aparezca en la lista.

**Formulario de alta**

- Obligatorios: `name`, `lastName`, `identify`.
- `email`, si se envía, debe ser un email válido (si no, `400`).
- `birthDate` debe ser un string ISO parseable (`"1990-05-20"` o ISO completo).
- `identify` **no es único**: el backend acepta dos pacientes con la misma identificación.
- `notes` se guarda como `""` si se omite, pero el seed dejó `null` en los datos
  existentes; por eso el tipo es `string | null`.

**Borrado:** soft delete (`isActive: false`). Devuelve el objeto con `isActive: false`,
no un `204`.

**No se puede actualizar `lastName` ni `identify`.** No están en `UpdatePatientDto`:
enviarlos produce `400 property lastName should not exist`. Si el producto necesita
editarlos, hay que añadir los campos al DTO primero.

---

## 5. Módulo Medical Histories + formulario dinámico

Base: `/api/medical-histories`.

| Método | Ruta | Body | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/medical-histories` | Query: `page`, `limit`, `patientId`, `type`, `dateStart`, `dateTo`, `search` | `200 { data: MedicalHistoryListItem[], meta }`; incluye resumen del paciente |
| `GET` | `/medical-histories/:id` | — | `200 MedicalHistory` sin relaciones · `404` |
| `POST` | `/medical-histories` | `CreateMedicalHistoryRequest` (requiere Bearer token; `clinicId` y `createdById` se asignan desde el usuario autenticado) | `201 { status, message, data: MedicalHistory }` sin relaciones |
| `PUT` | `/medical-histories/:id` | `UpdateMedicalHistoryRequest` | `200 { status, message, data: MedicalHistory }` sin relaciones |
| `DELETE` | `/medical-histories/:id` | — | `200 { status, message, data: MedicalHistory }` con `deleted: true` y `deletedAt` |

Todas las rutas de lectura filtran por la clínica activa del token. La ruta anidada en
pacientes valida la pertenencia del paciente y devuelve `MedicalHistoryWithRelations[]`:
incluye el paciente completo, la plantilla, los tratamientos, las indicaciones y el
medicamento asociado a cada indicación. El listado general devuelve solo
`MedicalHistoryListItem`; el detalle por ID y las respuestas de escritura no incluyen
relaciones.

Los listados excluyen historias borradas (`deleted: false`). La consulta por ID no
excluye historias borradas, por lo que puede devolver una historia con `deleted: true`.

En creación, `title`, `type`, `status` y `patientId` deben ser no vacíos; `patientId` debe
ser UUID. `date` debe ser ISO 8601. Los campos narrativos restantes son strings
obligatorios (se admite cadena vacía). `vitalSigns`, `data` y `templateSnapshot` son
objetos JSON opcionales; se valida que sean objetos, no la estructura interna de sus
propiedades. En actualización, `title`, `data`, `notes` y `templateId` son opcionales.

### 5.1 El formulario de intake

`MedicalHistory.data` es un **campo JSON libre**: ahí se guardan las respuestas del
formulario. En creación se valida que sea un objeto, pero no se valida su contenido
(`{"x":1}` es válido); el frontend es responsable de la forma interna.

El formulario se define en el módulo **Customize**:

| Método | Ruta | Body | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/customize` | Query: `page`, `limit`, `search`, `condition`, `type`, `isActive` | `200 { data: FormTemplate[], meta }`; cada plantilla incluye sus campos activos ordenados |
| `GET` | `/customize/templates/:id` | — | `200 FormTemplate` con campos activos · `404 Plantilla no encontrada` |
| `POST` | `/customize/templates` | `CreateFormTemplateRequest` (opcionalmente incluye `fields[]`) | `201 { status, message, data: FormTemplate }` con los campos creados y ordenados |
| `PUT` | `/customize/templates/:id` | `UpdateFormTemplateRequest` | `200 { status, message, data: FormTemplate }` |
| `DELETE` | `/customize/templates/:id` | — | Soft delete: desactiva la plantilla |
| `GET` | `/customize/fields` | Query: `page`, `limit`, `search`, `templateId`, `fieldType`, `step`, `isRequired`, `isActive` | `200 { data: CustomField[], meta }` de la clínica activa |
| `GET` | `/customize/fields/:id` | — | `200 CustomField` de la clínica activa · `404 Campo no encontrado` |
| `POST` | `/customize/fields` | `CreateCustomFieldRequest` | `201 { status, message, data: CustomField }`; `templateId` es opcional y usa `General` si se omite |
| `PUT` | `/customize/fields/:id` | `UpdateCustomFieldRequest` | `200 { status, message, data: CustomField }` |
| `DELETE` | `/customize/fields/:id` | — | Soft delete del campo |
| `PUT` | `/customize/fields/reorder` | `ReorderCustomField[]` | `200 { status, message, data: CustomField[] }`; solo campos de la clínica y de una plantilla |

Al crear una plantilla, cada elemento de `fields[]` puede incluir `id`. Si se envía,
se reutiliza ese campo si pertenece a la clínica; si no, se busca por nombre sin
distinguir mayúsculas/minúsculas y, si no hay coincidencia, se crea. Reutilizar reasigna
el campo a la plantilla nueva (el modelo solo permite una plantilla por campo). La
creación de la plantilla y la asignación de todos sus campos son atómicas: un error
revierte la operación completa.

Se conservan las rutas legadas de campos: `/customize/:id`, `POST /customize`,
`PUT /customize/:id`, `DELETE /customize/:id` y `PUT /customize/reorder`.

### 5.2 Reordenar campos

Las rutas literales de reordenamiento se declaran antes de las rutas `:id`. Se rechaza
la operación si algún campo no pertenece a la clínica activa, si hay IDs repetidos o si
los campos pertenecen a distintas plantillas. `sortOrder` es un entero desde 0 y `step`
un entero desde 1.

### 5.3 `fieldType` no es un enum

El backend no restringe `fieldType`: es un string libre. La tabla llega **vacía** tras el
seed, así que los tipos existentes dependen de lo que cree el administrador. Para que el
frontend sea robusto, renderiza por `fieldType` con un `switch` que tenga un `default`
para texto, y no confíes en que el valor esté en una lista fija:

| `fieldType` recomendado | Control Angular | `options` |
| --- | --- | --- |
| `text` | `<input type="text">` | — |
| `textarea` | `<textarea>` | — |
| `number` | `<input type="number">` | — |
| `date` | `<input type="date">` | — |
| `select` | `<select>` | **obligatorio** |
| `radio` | botones radio | **obligatorio** |
| `checkbox` | un checkbox por opción | **obligatorio** |
| `boolean` | un checkbox único | `[]` |

Reglas para construir el formulario:

1. Agrupa por `step`: `fields.filter(f => f.step === n)` y ordena por `sortOrder asc`.
  Las respuestas de plantillas y campos vienen ordenadas por `step` y luego `sortOrder`.
2. Marca como `required` los campos con `isRequired: true`; valida en cliente antes de
   enviar (el backend no lo comprueba).
3. El **valor guardado** en `data` se decide en el frontend. Recomendación: guardar la
   respuesta bajo el **id** del campo para no depender del nombre:
   `data: { [field.id]: value }`, con `select`/`radio` como string y `checkbox` como
   `string[]`.
4. `options` llega siempre como `[]` cuando el campo no tiene opciones — no `null`.

---

## 6. Módulo Quotes (presupuestos)

Base: `/api/quotes`.

| Método | Ruta | Body | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/quotes` | Query: `page`, `limit`, `search`, `status`, `patientId`, `isActive`, `createdFrom`, `createdTo` | `200 { data: Quote[], meta }` con `patient` y `items` incluidos |
| `POST` | `/quotes` | `CreateQuoteRequest` (requiere Bearer token; `clinicId` y `createdById` se toman del usuario autenticado) | `201 { status, message, data: Quote }` con `patient` e `items` |
| `PUT` | `/quotes/:id` | `UpdateQuoteRequest` | `200 { status, message, data: Quote }` |
| `DELETE` | `/quotes/:id` | — | `200 { status, message, data: Quote }` |

**No existe `GET /quotes/:id`** (el service lo tiene, el controller no lo expone).

**Cómo calcular el presupuesto** — la parte que más errores causa:

1. El **cliente envía `total`**, y el servidor lo guarda tal cual: **no se recalcula**
   desde los items. Si no lo mandas, `400` (es obligatorio). Si lo mandas mal, el
   presupuesto queda con un total que no cuadra con la suma de sus líneas.
2. Cada `items[].total` **sí lo calcula el servidor**: `unitPrice × (quantity || 1)`.
   Solo hay que mandar `name`, `unitPrice` y opcionalmente `quantity`/`description`.
3. `quantity` sin valor se guarda como `1`.
4. `dolarId` **debe ser el id de una fila real de la tabla `Dolar`**. Se obtiene de
   `GET /services-costs/dolar` (guardar la referencia al snapshot del día, como está
   previsto en el modelo) — ver §7. Un id inexistente revienta con un `500` genérico,
   no con un `404` amable: valida el id antes de enviar.
5. `validUntil` es opcional; `date` lo pone el servidor.
6. `status` es un string libre con `"pending"` por defecto.
7. `PUT` **no actualiza los items**: solo los campos del presupuesto. Para cambiar una
   línea hay que borrar y recrear el presupuesto.

---

## 7. Módulo Services Costs y dólar

Base: `/api/services-costs`.

| Método | Ruta | Body | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/services-costs` | Query: `page`, `limit`, `search`, `isActive`, `minPrice`, `maxPrice` | `200 { data: ServiceCost[], meta }` (clínica activa, `createdAt desc`) |
| `POST` | `/services-costs` | `CreateServiceCostRequest` (requiere Bearer token; `clinicId` se toma del consultorio activo del token) | `201 { status, message, data: ServiceCost }` |
| `PUT` | `/services-costs/:id` | `CreateServiceCostRequest` (completo) | `200 { status, message, data: ServiceCost }` |
| `DELETE` | `/services-costs/:id` | — | `200 { status, message, data: ServiceCost }` |
| `GET` | `/services-costs/dolar` | — | `200 Dolar` — ⚠️ ver abajo |
| `GET` | `/services-costs/dolar/save` | — | `200 { success, message, data: Dolar }` — 1/min |

**No existe `GET /services-costs/:id`.**

### 7.1 ⚠️ `GET /services-costs/dolar` devuelve el cuerpo vacío

Si todavía no se ha guardado ninguna tasa, la respuesta es **`200` con cuerpo vacío**
(no `null`, no `{}`):

```
GET /api/services-costs/dolar  ->  HTTP 200, body: "" (cero bytes)
```

Un `HttpClient.get<Dolar>()` de Angular falla al parsear eso. Trátalo así:

```ts
// Antes de usar la tasa, llama a /dolar/save para sembrarla.
const res = await fetch(`${base}/services-costs/dolar`, { headers });
const texto = await res.text();
const dolar: Dolar | null = texto ? JSON.parse(texto) : null;
```

Además, si la consulta a la base falla, el endpoint devuelve `200` con
`{ success: false, data: null, message: '…' }` — o sea, **la forma de la respuesta
cambia según el caso**. Comprueba siempre el texto antes de parsear.

### 7.2 `GET /services-costs/dolar/save`

Llama a la API externa de dolarapi, inserta una fila nueva en `Dolar` y la devuelve.
Límite: **1 req/min por IP**; el siguiente intento dentro del minuto da `429`.

Si la API externa falla, responde **`200`** con
`{ success: false, message: 'Error al obtener el precio del dolar en estos momentos.', data: null }`.
Por eso hay que mirar el campo `success` y no solo el status HTTP.

---

## 8. Módulo Providers

Base: `/api/providers`. El listado filtra por el consultorio activo; las rutas de
actualización y eliminación todavía no filtran por clínica.

| Método | Ruta | Body | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/providers` | Query: `page`, `limit`, `search`, `type`, `isActive` | `200 { data: Provider[], meta }` con `services` anidadas |
| `POST` | `/providers` | `CreateProviderRequest` (requiere Bearer token; `clinicId` se toma del usuario autenticado) | `201 { status, message, data: Provider }` |
| `PUT` | `/providers/:id` | `CreateProviderRequest` (completo) | `200 { status, message, data: Provider }` |
| `DELETE` | `/providers/:id` | — | `200 { status, message, data: Provider }` |
| `POST` | `/providers/:id/services` | `CreateProviderServiceRequest` | `201 { status, message, data: ProviderService }` |
| `PUT` | `/providers/services/:serviceId` | `CreateProviderServiceRequest` (completo) | `200 { status, message, data: ProviderService }` |
| `DELETE` | `/providers/services/:serviceId` | — | `200 { status, message, data: ProviderService }` |

**No existe `GET /providers/:id`.** Para ver un proveedor con sus servicios hay que
buscarlo dentro de `GET /providers`.

**Trampa importante:** las `services` anidadas en `GET /providers` **incluyen las de
`isActive: false`**. El backend no filtra la relación anidada, así que el frontend debe
aplicar `provider.services.filter(s => s.isActive)` antes de mostrarlas.

`PUT /providers/:id` y `PUT /providers/services/:serviceId` exigen el DTO **completo**
(`name` y `price`/`businessName` obligatorios): un `PUT` parcial da `400`.

`type` es texto libre (el seed usa "Laboratorio", "Transportación", etc.). `price` se
envía como número y vuelve como string.

---

## 9. Módulo Payment Info

Base: `/api/payment-info`. El listado filtra por el consultorio activo; las rutas de
actualización y eliminación todavía no filtran por clínica.

| Método | Ruta | Body | Respuesta |
| --- | --- | --- | --- |
| `GET` | `/payment-info` | Query: `page`, `limit`, `search`, `isActive` | `200 { data: PaymentMethod[], meta }` (clínica activa, `createdAt desc`) |
| `POST` | `/payment-info` | `CreatePaymentMethodRequest` (requiere Bearer token; `clinicId` se toma del usuario autenticado) | `201 { status, message, data: PaymentMethod }` |
| `PUT` | `/payment-info/:id` | `CreatePaymentMethodRequest` (completo) | `200 { status, message, data: PaymentMethod }` |
| `DELETE` | `/payment-info/:id` | — | `200 { status, message, data: PaymentMethod }` |

**No existe `GET /payment-info/:id`.**

`phone`, `email` y `account` son **opcionales en el DTO pero obligatorios en la base de
datos** (columnas `String` sin `?`). Si se omiten, el POST responde `201` pero el
registro queda con cadenas vacías. Manda siempre los cinco campos.

---

## 10. Resumen de ausencias y defects conocidos

Todo lo siguiente está **verificado** contra la API en ejecución:

| # | Ausencia / defecto | Impacto en el frontend |
| --- | --- | --- |
| 1 | Ningún endpoint acepta query params: no hay búsqueda, paginación, orden ni filtros | Filtrar y paginar en cliente; con muchos registros la lista llega entera |
| 3 | `GET /services-costs/dolar` con cuerpo vacío cuando no hay tasas (§7.1) | Parsear texto, no JSON, y tratar `null` |
| 4 | `/dolar` y `/dolar/save` cambian de forma según el resultado | Comprobar `success` además del status HTTP |
| 5 | `Decimal` → string | `parseFloat` para cualquier cálculo |
| 6 | `Quote.total` lo manda el cliente y no se recalcula | Calcular la suma en el frontend antes de enviar |
| 7 | `Quote` no se puede consultar por id | Filtrar la lista |
| 8 | `GET /patients/:id` no filtra `isActive` | Un paciente borrado sigue siendo obtenible por id |
| 9 | `PUT /patients/:id` no acepta `lastName` ni `identify` | `400` si se envían |
| 10 | `/auth/profile` y todos los `GET` devuelven objetos/arrays sin envoltura | Un interceptor que exija `{ data }` los rompe |
| 11 | `providers[].services` incluye inactivos | Filtrar por `isActive` |
| 12 | `phone`/`email`/`account` de pago: opcionales en DTO, obligatorios en BD | Mandarlos siempre |
| 13 | `MedicalHistory.data` sin validación | El frontend valida el formulario |
| 14 | `role` no autoriza nada | Ocultar controles por rol es cosmético, no seguro |
| 15 | `GET /api/` devuelve el texto `Hello World!` con `content-type: application/json` (cuerpo no-JSON) | No llamarlo |
| 16 | `dolarId` inexistente produce `500` genérico, no `404` | Validar el id en cliente |

## 11. Arranque rápido

```ts
// 1. Login
const { data } = await firstValueFrom(
  this.http.post<{ success: true; data: LoginResponse }>('/api/auth/login',
    { email, password })
);
localStorage.setItem('token', data.data.access_token);

// 2. Interceptor
intercept(req, next) {
  const token = localStorage.getItem('token');
  if (token) req.headers.set('Authorization', `Bearer ${token}`);
  return next.handle(req);
}

// 3. Escrituras: pueden venir { status } o { success }
const res = await firstValueFrom(this.http.post<ApiWriteOk<Patient>>('/api/patients', form));
if (res.status) this.toast.success(res.message);

// 4. Listas: array desnudo
const patients = await firstValueFrom(this.http.get<Patient[]>('/api/patients'));

// 5. Dólar: cuerpo potencialmente vacío
const texto = await (await fetch('/api/services-costs/dolar',
  { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })).text();
const dolar = texto ? JSON.parse(texto) : null;
```
