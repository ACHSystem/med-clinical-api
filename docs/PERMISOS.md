# Permisos por rol de membresía

El rol efectivo es el de `ClinicUser` (membresía), no el de `User`. El mismo usuario
puede ser `DOCTOR` en un consultorio y `ASSISTANT` en otro.

## Matriz

| Recurso / acción | DOCTOR | ASSISTANT |
| --- | --- | --- |
| Auth: login, perfil, consultorios, cambiar consultorio | Sí | Sí |
| Auth: registrar usuarios | Sí | No |
| Pacientes: leer | Sí | Sí |
| Pacientes: crear / editar / reactivar | Sí | Sí |
| Pacientes: borrar | Sí | No |
| Historias clínicas: leer | Sí | Sí |
| Historias clínicas: crear / editar / borrar | Sí | No |
| Historias clínicas: firmar | Sí | No |
| Plantillas y campos: leer | Sí | Sí |
| Plantillas y campos: crear / editar / borrar / reordenar | Sí | No |
| Proveedores y servicios: leer | Sí | Sí |
| Proveedores y servicios: crear / editar / borrar | Sí | No |
| Costos de servicio: leer | Sí | Sí |
| Costos de servicio: crear / editar / borrar | Sí | No |
| Dólar: consultar | Sí | Sí |
| Dólar: guardar manual o automático | Sí | No |
| Métodos de pago: leer | Sí | Sí |
| Métodos de pago: crear / editar / borrar | Sí | No |
| Presupuestos: leer | Sí | Sí |
| Presupuestos: crear / editar borrador / reactivar / revisar | Sí | Sí |
| Presupuestos: emitir / cancelar / vencer | Sí | Sí |
| Presupuestos: aprobar / rechazar | Sí | No |
| Presupuestos: borrar | Sí | No |
| Auditoría: consultar | Sí | No |
| Métricas: scrapear con `x-metrics-token` | Servicio externo | Servicio externo |

## Implementación

- `@Roles(Role.DOCTOR)` en los endpoints sensibles.
- `RolesGuard` global, registrado después de `AuthGuard` en `src/app.module.ts`.
- `AuthGuard` inyecta `request.user.role` desde la membresía y actualiza el request context.
- Un ASSISTANT recibe `403 FORBIDDEN` con mensaje `No tienes permisos para esta acción`.

## Handoff frontend (pendiente en `med-clinical`)

El backend ya rechaza las acciones no permitidas. Para que la UI no muestre controles
inútiles, el frontend debe:

1. Leer `AuthService.user()?.role` y construir un `PermissionService` con la matriz de arriba.
2. Ocultar o deshabilitar:
   - Pacientes: botón de eliminar.
   - Historias: “Nueva consulta”, guardar/editar/borrar y el botón de firma.
   - Plantillas: alta, edición, borrado y reordenamiento.
   - Proveedores: alta, edición, borrado y CRUD de servicios.
   - Costos: alta, edición, borrado y guardado de dólar.
   - Métodos de pago: alta, edición y borrado.
   - Presupuestos: aprobar, rechazar y borrado (el resto de acciones de presupuesto sí
     están disponibles para ASSISTANT).
   - Header/dashboard: “Nueva consulta”.
3. Opcional: `canMatch`/`canActivate` por ruta para impedir el acceso directo a pantallas
   exclusivas de DOCTOR. Si se mantiene lectura para ASSISTANT, no hace falta bloquear la ruta,
   solo las acciones.
4. Actualizar `BaseService` al nuevo contrato (`{data}`, `{data,pagination}`,
   `{status,message,data}`, errores con `code/requestId`).
