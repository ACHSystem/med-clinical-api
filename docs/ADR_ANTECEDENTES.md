# ADR — Antecedentes clínicos del paciente

## Contexto

La ficha del paciente necesita patologías, alergias, condiciones y antecedentes
consultables y reutilizables entre consultas. Hoy solo existe `Patient.notes` (texto libre)
y `MedicalHistory.diagnosis` (texto por consulta), que no permiten responder "todos los
pacientes hipertensos" ni separar una alergia de un antecedente quirúrgico.

## Opciones evaluadas

| Criterio | A — Derivado | B — Curado | C — Híbrido |
| --- | --- | --- | --- |
| Fuente de verdad | Diagnósticos/alergias dentro de historias | Tabla `PatientCondition` | Tabla para antecedentes + historias para timeline |
| Consultas por tipo/etiqueta | Difícil, texto libre | Sí | Sí |
| Duplicados y calidad | Alto ruido | Controlado | Controlado |
| Edición sin crear consulta | No | Sí | Sí |
| Timeline clínica | No | No | Sí |
| Migración | Nula | Alta | Media |
| Riesgo | Bajo costo, poca utilidad | Tabla extra | Tabla extra + lectura agregada |

**Decisión: Opción C — Híbrido.**

- `PatientCondition` guarda lo que el médico decide conservar como antecedente.
- `MedicalHistory` sigue siendo la fuente de la timeline de consultas.
- No se copian diagnósticos automáticamente: el vínculo se crea de forma explícita con
  `sourceMedicalHistoryId`.

## Definiciones

**Antecedente clínico:** registro persistente y relevante para decisiones clínicas que
sobrevive entre consultas y se muestra en la ficha. Es el término paraguas; sus tipos son:

| `kind` | Nombre | Qué representa | Ejemplos |
| --- | --- | --- | --- |
| `PATHOLOGY` | Patología | Enfermedad diagnosticada, activa o en seguimiento | Hipertensión, DM2, asma, cáncer |
| `ALLERGY` | Alergia | Reacción de hipersensibilidad a fármaco, alimento o ambiente | Penicilina, látex, mariscos |
| `CONDITION` | Condición | Estado fisiológico, factor de riesgo o dispositivo que condiciona el manejo, sin ser una enfermedad diagnosticada | Embarazo, lactancia, tabaquismo, anticoagulación, marcapasos |
| `ANTECEDENT` | Antecedente | Evento pasado o historia familiar que ya no es enfermedad activa | Cirugía previa, hospitalización, transfusión, familiar con DM, patología resuelta |

Regla de desempate:

1. Diagnóstico formal → `PATHOLOGY`.
2. Reacción a una sustancia → `ALLERGY`.
3. Estado, riesgo o dispositivo → `CONDITION`.
4. Evento pasado o familiar → `ANTECEDENT`.

## Vigencia

- `isActive: true`: vigente y relevante para prescribir o tratar.
- `isActive: false`: resuelto o no vigente; se conserva y se muestra en la ficha.
- `diagnosedAt`: fecha de inicio o diagnóstico; `null` si se desconoce.
- No hay expiración automática ni fecha de fin obligatoria.
- Si una condición resuelta reaparece, se reactiva la misma fila; no se duplica.
- Las alergias activas se muestran como alerta. Las inactivas quedan en antecedentes.

## Duplicados

- Normalización: `trim`, colapsar espacios, minúsculas y quitar diacríticos.
  `Hipertensión  arterial` → `hipertension arterial`.
- Se persiste `normalizedLabel`.
- Equivalencia = mismo `patientId` + `kind` + `normalizedLabel`.
- Crear un equivalente activo → `409 CONFLICT`.
- Crear un equivalente inactivo → se reactiva y actualiza la fila existente.
- Editar una etiqueta que choque con otro equivalente → `409`.
- Restricción única en BD: `@@unique([patientId, kind, normalizedLabel])`.
- El mismo texto en distinto `kind` se permite, pero se documenta como posible ambigüedad.

## Origen

- `sourceMedicalHistoryId = null` → creado manualmente.
- `sourceMedicalHistoryId != null` → creado desde una historia; se valida que la historia
  pertenezca al mismo paciente y clínica y no esté borrada.
- La timeline se deriva siempre de `MedicalHistory`; no se copia a `PatientCondition`.
- No hay extracción automática por NLP ni backfill silencioso.

## Estrategia para datos existentes

Los antecedentes previos quedan donde están:

- `Patient.notes` se conserva como "Notas generales" en la ficha.
- `MedicalHistory.diagnosis` se conserva y aparece en la timeline.
- `MedicalHistory.data` (respuestas del formulario) no se interpreta.
- El médico puede crear el antecedente desde una historia para llenar
  `sourceMedicalHistoryId`.
- La migración **no** convierte diagnósticos en condiciones automáticamente: evita ruido
  y etiquetas-frase.

## Qué muestra la ficha

`GET /api/patients/:patientId/clinical-summary` devuelve:

1. Datos del paciente y edad derivada de `birthDate`.
2. Alerta de alergias activas (`activeAllergies`).
3. Antecedentes agrupados por `kind`, activos primero, ordenados por `diagnosedAt`
   descendente y luego por etiqueta.
4. Timeline de consultas y addenda, más reciente primero.
5. Notas generales legacy de `Patient.notes`.
6. Últimos signos vitales de una consulta dentro de la ventana de timeline.

La ficha no modifica datos; solo lee.

## Modelo

```prisma
enum PatientConditionKind {
  PATHOLOGY
  ALLERGY
  CONDITION
  ANTECEDENT
}

model PatientCondition {
  id                     String               @id @default(uuid())
  patientId              String
  clinicId               String
  kind                   PatientConditionKind
  label                  String
  normalizedLabel        String
  notes                  String?
  diagnosedAt            DateTime?
  isActive               Boolean              @default(true)
  sourceMedicalHistoryId String?
  createdAt              DateTime             @default(now())
  updatedAt              DateTime             @updatedAt

  @@unique([patientId, kind, normalizedLabel])
  @@index([clinicId, patientId, kind, isActive])
  @@index([patientId, kind])
  @@index([sourceMedicalHistoryId])
}
```

## API

Base: `/api/patients/:patientId/conditions`.

| Método | Ruta | Rol |
| --- | --- | --- |
| `GET` | `/patients/:patientId/conditions` | Cualquiera |
| `POST` | `/patients/:patientId/conditions` | DOCTOR |
| `GET` | `/patients/:patientId/conditions/:conditionId` | Cualquiera |
| `PUT` | `/patients/:patientId/conditions/:conditionId` | DOCTOR |
| `DELETE` | `/patients/:patientId/conditions/:conditionId` | DOCTOR (desactiva) |
| `GET` | `/patients/:patientId/clinical-summary` | Cualquiera |

`PUT` con `{ "isActive": true }` reactiva un antecedente desactivado.
