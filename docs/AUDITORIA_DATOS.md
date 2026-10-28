# Auditoría de datos clínicos y comerciales

## Modelo

`AuditLog` es inmutable: no tiene `updatedAt` ni endpoints de edición/borrado.

| Campo | Descripción |
| --- | --- |
| `id` | UUID del registro de auditoría |
| `clinicId` | Consultorio donde ocurrió la acción (nullable para datos globales) |
| `userId` | Usuario que ejecutó la acción (nullable para procesos de sistema) |
| `entity` | `Patient`, `MedicalHistory`, `Quote`, `Provider`, `ProviderService`, `ServiceCost`, `PaymentMethod`, `FormTemplate`, `CustomField`, `Dolar` |
| `entityId` | ID del registro afectado |
| `action` | `CREATE`, `UPDATE`, `DELETE`, `SIGN` |
| `metadata` | Nombres de campos/estados y flags; nunca contenido clínico |
| `ipAddress` | IP del cliente |
| `requestId` | ID de la petición |
| `createdAt` | Fecha/hora de la acción |

## Acciones registradas

- Pacientes: alta, edición y baja lógica.
- Historias clínicas: alta, edición, baja lógica y firma.
- Presupuestos: alta, edición de borrador, revisión (nueva versión), transiciones de
  estado y baja lógica.
- Proveedores y servicios: alta, edición y baja lógica.
- Costos de servicio y tasa del dólar.
- Métodos de pago.
- Plantillas y campos personalizados, incluido el reordenamiento.

Cada mutación y su auditoría se escriben en la **misma transacción** en los módulos
clínicos/comerciales principales. Si falla la auditoría, la mutación se revierte.

## Sanitización

`AuditService.sanitize()` elimina:

`password`, `token`, `access_token`, `authorization`, `data`, `vitalSigns`, `notes`,
`diagnosis`, `symptoms`, `observations`, `evaluation`, `reason`, `email`, `phone`,
`address`, `identify`, `account`.

Solo conserva:

- Nombres de campos (`fields`).
- Estados, flags y totales.
- Fechas de firma.

## Consulta

`GET /api/audit-logs` (solo DOCTOR), paginado:

```http
GET /api/audit-logs?entity=MedicalHistory&action=SIGN&page=1&limit=20
Authorization: Bearer <token>
```

Respuesta:

```json
{
  "data": [
    {
      "id": "...",
      "clinicId": "...",
      "userId": "...",
      "entity": "MedicalHistory",
      "entityId": "...",
      "action": "SIGN",
      "metadata": { "signedAt": "2026-10-28T05:18:07.451Z" },
      "ipAddress": "::ffff:127.0.0.1",
      "requestId": "...",
      "createdAt": "2026-10-28T05:18:07.472Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "totalElements": 1, "totalPages": 1 }
}
```

## Retención y acceso

- Acceso de lectura: solo DOCTOR del consultorio.
- Retención recomendada: la que exija la normativa local para historia clínica; por
  defecto, no purgar automáticamente.
- Si se implementa purga, hacerlo por política documentada y conservando un registro de
  la propia purga.
- No replicar `metadata` a sistemas externos sin revisar que no contenga datos personales.
