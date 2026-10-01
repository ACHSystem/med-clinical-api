/*
  Warnings:

  - A unique constraint covering the columns `[identify]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clinicId,identify]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[identify]` on the table `Provider` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `date` to the `MedicalHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `diagnosis` to the `MedicalHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `evaluation` to the `MedicalHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `observations` to the `MedicalHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reason` to the `MedicalHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `MedicalHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `symptoms` to the `MedicalHistory` table without a default value. This is not possible if the table is not empty.
  - Made the column `type` on table `MedicalHistory` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "MedicalHistory_clinicId_createdAt_idx";

-- DropIndex
DROP INDEX "MedicalHistory_patientId_createdAt_idx";

-- DropIndex
DROP INDEX "Patient_clinicId_isActive_idx";

-- AlterTable
ALTER TABLE "MedicalHistory" ADD COLUMN     "date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "diagnosis" TEXT NOT NULL,
ADD COLUMN     "evaluation" TEXT NOT NULL,
ADD COLUMN     "observations" TEXT NOT NULL,
ADD COLUMN     "reason" TEXT NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL,
ADD COLUMN     "symptoms" TEXT NOT NULL,
ADD COLUMN     "vitalSigns" JSONB,
ALTER COLUMN "data" DROP NOT NULL,
ALTER COLUMN "type" SET NOT NULL;

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "confirmedAt" TIMESTAMP(3),
    "attendedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "rescheduledAt" TIMESTAMP(3),
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "channel" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "medicalHistoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalTreatments" (
    "id" TEXT NOT NULL,
    "medicalHistoryId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "title" TEXT,
    "plan" TEXT,
    "recommendations" TEXT,
    "notes" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "medicationId" TEXT,

    CONSTRAINT "MedicalTreatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activeIngredient" TEXT,
    "presentation" TEXT,
    "concentration" TEXT,
    "form" TEXT,
    "notes" TEXT,
    "clinicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentMedication" (
    "id" TEXT NOT NULL,
    "medicalTreatmentId" TEXT NOT NULL,
    "medicationId" TEXT,
    "medicationName" TEXT NOT NULL,
    "activeIngredient" TEXT,
    "presentation" TEXT,
    "concentration" TEXT,
    "dose" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "route" TEXT,
    "duration" TEXT,
    "quantity" TEXT,
    "instructions" TEXT,
    "notes" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" TEXT,

    CONSTRAINT "TreatmentMedication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_medicalHistoryId_key" ON "Appointment"("medicalHistoryId");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_scheduledAt_idx" ON "Appointment"("clinicId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_patientId_scheduledAt_idx" ON "Appointment"("patientId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_userId_scheduledAt_idx" ON "Appointment"("userId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_status_scheduledAt_idx" ON "Appointment"("clinicId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "MedicalTreatments_clinicId_idx" ON "MedicalTreatments"("clinicId");

-- CreateIndex
CREATE INDEX "Medication_clinicId_idx" ON "Medication"("clinicId");

-- CreateIndex
CREATE INDEX "Medication_clinicId_name_idx" ON "Medication"("clinicId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Medication_clinicId_name_concentration_key" ON "Medication"("clinicId", "name", "concentration");

-- CreateIndex
CREATE INDEX "TreatmentMedication_medicalTreatmentId_sortOrder_idx" ON "TreatmentMedication"("medicalTreatmentId", "sortOrder");

-- CreateIndex
CREATE INDEX "TreatmentMedication_medicationId_idx" ON "TreatmentMedication"("medicationId");

-- CreateIndex
CREATE INDEX "MedicalHistory_clinicId_patientId_createdAt_type_status_idx" ON "MedicalHistory"("clinicId", "patientId", "createdAt", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_identify_key" ON "Patient"("identify");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_clinicId_identify_key" ON "Patient"("clinicId", "identify");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_identify_key" ON "Provider"("identify");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_medicalHistoryId_fkey" FOREIGN KEY ("medicalHistoryId") REFERENCES "MedicalHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalTreatments" ADD CONSTRAINT "MedicalTreatments_medicalHistoryId_fkey" FOREIGN KEY ("medicalHistoryId") REFERENCES "MedicalHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalTreatments" ADD CONSTRAINT "MedicalTreatments_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalTreatments" ADD CONSTRAINT "MedicalTreatments_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentMedication" ADD CONSTRAINT "TreatmentMedication_medicalTreatmentId_fkey" FOREIGN KEY ("medicalTreatmentId") REFERENCES "MedicalTreatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentMedication" ADD CONSTRAINT "TreatmentMedication_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentMedication" ADD CONSTRAINT "TreatmentMedication_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
