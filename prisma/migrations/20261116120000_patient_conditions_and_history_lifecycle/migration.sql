-- Antecedentes clínicos curados + ciclo de vida de historias.
--
-- La base local tiene dos cambios aplicados manualmente que no quedaron en el
-- historial de migraciones (PaymentMethod.type y Quote.total). Las primeras
-- sentencias son idempotentes y alinean el historial sin tocar datos.

-- ── Drift sync ────────────────────────────────────────────────────────────
ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Quote" ALTER COLUMN "total" TYPE DECIMAL(12, 2);

-- ── Enums ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE TYPE "MedicalHistoryStatus" AS ENUM ('DRAFT', 'COMPLETED', 'AMENDED', 'CANCELLED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PatientConditionKind" AS ENUM ('PATHOLOGY', 'ALLERGY', 'CONDITION', 'ANTECEDENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── MedicalHistory: addendum y cancelación ────────────────────────────────
ALTER TABLE "MedicalHistory"
  ADD COLUMN IF NOT EXISTS "amendReason" TEXT,
  ADD COLUMN IF NOT EXISTS "amendedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "amendsId" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelReason" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledById" TEXT;

-- Convertir status TEXT -> MedicalHistoryStatus. Los valores legacy del frontend
-- ("Asistida") y de la base anterior se mapean sin perder historias.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'MedicalHistory'
      AND column_name = 'status'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE "MedicalHistory" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "MedicalHistory" ALTER COLUMN "status" TYPE "MedicalHistoryStatus" USING (
      CASE lower(btrim("status"))
        WHEN 'draft' THEN 'DRAFT'::"MedicalHistoryStatus"
        WHEN 'borrador' THEN 'DRAFT'::"MedicalHistoryStatus"
        WHEN 'completed' THEN 'COMPLETED'::"MedicalHistoryStatus"
        WHEN 'completada' THEN 'COMPLETED'::"MedicalHistoryStatus"
        WHEN 'completa' THEN 'COMPLETED'::"MedicalHistoryStatus"
        WHEN 'asistida' THEN 'COMPLETED'::"MedicalHistoryStatus"
        WHEN 'atendida' THEN 'COMPLETED'::"MedicalHistoryStatus"
        WHEN 'finalizada' THEN 'COMPLETED'::"MedicalHistoryStatus"
        WHEN 'amended' THEN 'AMENDED'::"MedicalHistoryStatus"
        WHEN 'enmendada' THEN 'AMENDED'::"MedicalHistoryStatus"
        WHEN 'cancelled' THEN 'CANCELLED'::"MedicalHistoryStatus"
        WHEN 'canceled' THEN 'CANCELLED'::"MedicalHistoryStatus"
        WHEN 'cancelada' THEN 'CANCELLED'::"MedicalHistoryStatus"
        WHEN 'anulada' THEN 'CANCELLED'::"MedicalHistoryStatus"
        WHEN 'archived' THEN 'ARCHIVED'::"MedicalHistoryStatus"
        WHEN 'archivada' THEN 'ARCHIVED'::"MedicalHistoryStatus"
        ELSE 'COMPLETED'::"MedicalHistoryStatus"
      END
    );
  END IF;
END $$;

ALTER TABLE "MedicalHistory" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- Normalizar filas legacy para que cumplan las invariantes nuevas.
UPDATE "MedicalHistory"
SET "status" = 'COMPLETED'::"MedicalHistoryStatus"
WHERE "status" = 'AMENDED'::"MedicalHistoryStatus"
  AND "amendsId" IS NULL;

UPDATE "MedicalHistory"
SET "signedAt" = COALESCE("signedAt", "updatedAt")
WHERE "status" = 'AMENDED'::"MedicalHistoryStatus"
  AND "signedAt" IS NULL;

UPDATE "MedicalHistory"
SET "cancelledAt" = COALESCE("cancelledAt", "updatedAt", CURRENT_TIMESTAMP)
WHERE "status" = 'CANCELLED'::"MedicalHistoryStatus"
  AND "cancelledAt" IS NULL;

-- ── PatientCondition ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PatientCondition" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "kind" "PatientConditionKind" NOT NULL,
  "label" TEXT NOT NULL,
  "normalizedLabel" TEXT NOT NULL,
  "notes" TEXT,
  "diagnosedAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sourceMedicalHistoryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PatientCondition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PatientCondition_clinicId_patientId_kind_isActive_idx"
  ON "PatientCondition"("clinicId", "patientId", "kind", "isActive");

CREATE INDEX IF NOT EXISTS "PatientCondition_patientId_kind_idx"
  ON "PatientCondition"("patientId", "kind");

CREATE INDEX IF NOT EXISTS "PatientCondition_sourceMedicalHistoryId_idx"
  ON "PatientCondition"("sourceMedicalHistoryId");

CREATE UNIQUE INDEX IF NOT EXISTS "PatientCondition_patientId_kind_normalizedLabel_key"
  ON "PatientCondition"("patientId", "kind", "normalizedLabel");

CREATE INDEX IF NOT EXISTS "MedicalHistory_amendsId_idx"
  ON "MedicalHistory"("amendsId");

CREATE INDEX IF NOT EXISTS "MedicalHistory_cancelledById_idx"
  ON "MedicalHistory"("cancelledById");

CREATE INDEX IF NOT EXISTS "MedicalHistory_clinicId_patientId_status_date_idx"
  ON "MedicalHistory"("clinicId", "patientId", "status", "date");

-- ── Foreign keys ──────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE "MedicalHistory"
    ADD CONSTRAINT "MedicalHistory_amendsId_fkey"
    FOREIGN KEY ("amendsId") REFERENCES "MedicalHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "MedicalHistory"
    ADD CONSTRAINT "MedicalHistory_cancelledById_fkey"
    FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PatientCondition"
    ADD CONSTRAINT "PatientCondition_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PatientCondition"
    ADD CONSTRAINT "PatientCondition_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PatientCondition"
    ADD CONSTRAINT "PatientCondition_sourceMedicalHistoryId_fkey"
    FOREIGN KEY ("sourceMedicalHistoryId") REFERENCES "MedicalHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Invariantes de negocio ────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE "MedicalHistory"
    ADD CONSTRAINT "MedicalHistory_amended_requires_source"
    CHECK ("status" <> 'AMENDED'::"MedicalHistoryStatus" OR ("amendsId" IS NOT NULL AND "signedAt" IS NOT NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "MedicalHistory"
    ADD CONSTRAINT "MedicalHistory_cancelled_requires_timestamp"
    CHECK ("status" <> 'CANCELLED'::"MedicalHistoryStatus" OR "cancelledAt" IS NOT NULL);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
