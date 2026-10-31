-- Ciclo de vida de citas: estados tipados, reagendamiento y baja logica.

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED');

-- AlterTable: nuevas columnas y defaults
ALTER TABLE "Appointment"
  ADD COLUMN "noShowAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "rescheduledFromId" TEXT;

ALTER TABLE "Appointment"
  ALTER COLUMN "type" SET DEFAULT 'GENERAL_CONSULT',
  ALTER COLUMN "channel" SET DEFAULT 'IN_PERSON';

-- Convertir status TEXT -> AppointmentStatus mapeando valores historicos.
ALTER TABLE "Appointment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Appointment" ALTER COLUMN "status" TYPE "AppointmentStatus" USING (
  CASE upper("status")
    WHEN 'SCHEDULED' THEN 'SCHEDULED'::"AppointmentStatus"
    WHEN 'CONFIRMED' THEN 'CONFIRMED'::"AppointmentStatus"
    WHEN 'ATTENDED' THEN 'ATTENDED'::"AppointmentStatus"
    WHEN 'COMPLETED' THEN 'ATTENDED'::"AppointmentStatus"
    WHEN 'NO_SHOW' THEN 'NO_SHOW'::"AppointmentStatus"
    WHEN 'NO-SHOW' THEN 'NO_SHOW'::"AppointmentStatus"
    WHEN 'CANCELLED' THEN 'CANCELLED'::"AppointmentStatus"
    WHEN 'CANCELED' THEN 'CANCELLED'::"AppointmentStatus"
    WHEN 'RESCHEDULED' THEN 'RESCHEDULED'::"AppointmentStatus"
    WHEN 'PENDING' THEN 'SCHEDULED'::"AppointmentStatus"
    ELSE 'SCHEDULED'::"AppointmentStatus"
  END
);
ALTER TABLE "Appointment" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';

-- Normalizar datos legacy para que cumplan las invariantes nuevas.
UPDATE "Appointment"
SET "status" = 'SCHEDULED'
WHERE "status" = 'ATTENDED' AND "medicalHistoryId" IS NULL;

UPDATE "Appointment"
SET "medicalHistoryId" = NULL
WHERE "status" = 'NO_SHOW' AND "medicalHistoryId" IS NOT NULL;

-- CreateIndex / AddForeignKey
CREATE UNIQUE INDEX "Appointment_rescheduledFromId_key" ON "Appointment"("rescheduledFromId");

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_rescheduledFromId_fkey"
  FOREIGN KEY ("rescheduledFromId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invariantes de negocio a nivel de base de datos.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_attended_requires_history"
  CHECK ("status" <> 'ATTENDED'::"AppointmentStatus" OR "medicalHistoryId" IS NOT NULL);

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_no_show_forbids_history"
  CHECK ("status" <> 'NO_SHOW'::"AppointmentStatus" OR "medicalHistoryId" IS NULL);
