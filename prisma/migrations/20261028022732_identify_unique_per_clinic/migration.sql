-- La cedula/identificacion es unica por clinica, no globalmente.

-- DropIndex
DROP INDEX "Patient_identify_key";

-- DropIndex
DROP INDEX "Provider_identify_key";

-- CreateIndex
CREATE UNIQUE INDEX "Provider_clinicId_identify_key" ON "Provider"("clinicId", "identify");
