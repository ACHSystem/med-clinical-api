-- Separacion identidad (User) / tenant (Clinic) + plantillas de formulario
--
-- Decisiones de este backfill, aplicadas sobre el modelo legacy "1 User = 1 clinica"
-- (los datos colgaban de User.userId):
--  1. Se crea UNA Clinic por cada User que ya tenia datos. Es una correspondencia 1:1
--     fiel al modelo viejo: nadie gana acceso a datos que antes no podia ver. Fusionar
--     dos consultorios es una decision de negocio posterior, no una migracion.
--  2. La configuracion que era global (Provider/ProviderService, ServiceCost,
--     PaymentMethod) se COPIA a cada clinica, porque ahora pertenece a la clinica.
--  3. MedicalHistory/Quote guardan createdById (autoria) ademas de clinicId (tenant).

-- ---------------------------------------------------------------------------
-- 0. Repair de drift: "Quote.dolarId" existe en la base pero no estaba en la
--    migracion init. Se hace idempotente para que el historial de migraciones
--    vuelva a coincidir con la base y `migrate dev` deje de pedir reset.
-- ---------------------------------------------------------------------------
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "dolarId" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Quote_dolarId_fkey') THEN
        ALTER TABLE "Quote" ADD CONSTRAINT "Quote_dolarId_fkey"
            FOREIGN KEY ("dolarId") REFERENCES "Dolar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Tablas nuevas
-- ---------------------------------------------------------------------------
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "slug" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClinicUser" (
    "clinicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ASSISTANT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClinicUser_pkey" PRIMARY KEY ("clinicId","userId")
);

CREATE TABLE "FormTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "condition" TEXT,
    "description" TEXT,
    "type" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" TEXT NOT NULL,
    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 2. Columnas nuevas, primero NULLables para poder rellenar antes de exigir NOT NULL
-- ---------------------------------------------------------------------------
ALTER TABLE "Patient" ADD COLUMN "clinicId" TEXT;

ALTER TABLE "MedicalHistory" ADD COLUMN "clinicId" TEXT,
    ADD COLUMN "createdById" TEXT,
    ADD COLUMN "templateId" TEXT,
    ADD COLUMN "templateSnapshot" JSONB,
    ADD COLUMN "type" TEXT;

ALTER TABLE "Quote" ADD COLUMN "clinicId" TEXT,
    ADD COLUMN "createdById" TEXT;

ALTER TABLE "Provider" ADD COLUMN "clinicId" TEXT;

ALTER TABLE "ServiceCost" ADD COLUMN "clinicId" TEXT;

ALTER TABLE "PaymentMethod" ADD COLUMN "clinicId" TEXT;

ALTER TABLE "CustomField" ADD COLUMN "unit" TEXT,
    ADD COLUMN "helpText" TEXT,
    ADD COLUMN "placeholder" TEXT,
    ADD COLUMN "minValue" DOUBLE PRECISION,
    ADD COLUMN "maxValue" DOUBLE PRECISION,
    ADD COLUMN "templateId" TEXT;

-- ---------------------------------------------------------------------------
-- 3. Backfill: un consultorio por usuario legacy.
--    Se usa un mapa temporal en vez de emparejar por nombre: dos usuarios con
--    el mismo nombre chocarian en el PRIMARY KEY de ClinicUser.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE "_clinic_map" (
    "userId" TEXT PRIMARY KEY,
    "clinicId" TEXT NOT NULL
);

INSERT INTO "_clinic_map" ("userId", "clinicId")
SELECT u."id", gen_random_uuid()::text FROM "User" u WHERE u."isActive" = true;

-- slug se deja NULL a proposito: es UNIQUE y dos usuarios podrian generar el mismo
INSERT INTO "Clinic" ("id", "name", "taxId", "slug", "phone", "address", "isActive", "createdAt", "updatedAt")
SELECT
    m."clinicId",
    'Consultorio de ' || u."name" || ' ' || u."lastName",
    NULL, NULL, NULL, NULL,
    true,
    u."createdAt",
    u."updatedAt"
FROM "User" u
JOIN "_clinic_map" m ON m."userId" = u."id";

-- Cada usuario es miembro (y unico dueno heredado) de su consultorio
INSERT INTO "ClinicUser" ("clinicId", "userId", "role", "isActive", "createdAt", "updatedAt")
SELECT m."clinicId", u."id", u."role", u."isActive", u."createdAt", u."updatedAt"
FROM "User" u
JOIN "_clinic_map" m ON m."userId" = u."id";

-- Los datos que colgaban del usuario pasan a colgar de su consultorio
UPDATE "Patient" p
SET "clinicId" = m."clinicId"
FROM "_clinic_map" m
WHERE m."userId" = p."userId";

UPDATE "MedicalHistory" h
SET "clinicId" = m."clinicId",
    "createdById" = h."userId"
FROM "_clinic_map" m
WHERE m."userId" = h."userId";

UPDATE "Quote" q
SET "clinicId" = m."clinicId",
    "createdById" = q."userId"
FROM "_clinic_map" m
WHERE m."userId" = q."userId";

-- ---------------------------------------------------------------------------
-- 4. La configuracion que era global pasa a pertenecer a una clinica.
--    La PRIMERA clinica conserva las filas originales (sin perder ids); el resto
--    reciben una copia. Copiar y dejar las originales huerfanas con clinicId NULL
--    haria fallar el SET NOT NULL de mas abajo.
-- ---------------------------------------------------------------------------
UPDATE "Provider" SET "clinicId" = (SELECT "id" FROM "Clinic" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1) WHERE "clinicId" IS NULL;
UPDATE "ServiceCost" SET "clinicId" = (SELECT "id" FROM "Clinic" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1) WHERE "clinicId" IS NULL;
UPDATE "PaymentMethod" SET "clinicId" = (SELECT "id" FROM "Clinic" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1) WHERE "clinicId" IS NULL;

CREATE TEMP TABLE "_provider_map" (
    "oldId" TEXT NOT NULL,
    "newId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    -- PK compuesta: un mismo proveedor se copia a cada clinica distinta
    CONSTRAINT "_provider_map_pkey" PRIMARY KEY ("oldId", "clinicId")
);

INSERT INTO "_provider_map" ("oldId", "newId", "clinicId")
SELECT p."id", gen_random_uuid()::text, c."id"
FROM "Provider" p CROSS JOIN "Clinic" c
WHERE c."id" <> p."clinicId";

INSERT INTO "Provider" ("id", "name", "type", "businessName", "identify", "email", "phone", "address", "description", "isActive", "createdAt", "updatedAt", "clinicId")
SELECT m."newId", p."name", p."type", p."businessName", p."identify", p."email", p."phone", p."address", p."description", p."isActive", p."createdAt", p."updatedAt", m."clinicId"
FROM "Provider" p
JOIN "_provider_map" m ON m."oldId" = p."id";

INSERT INTO "ProviderService" ("id", "name", "description", "price", "isActive", "createdAt", "updatedAt", "providerId")
SELECT gen_random_uuid()::text, ps."name", ps."description", ps."price", ps."isActive", ps."createdAt", ps."updatedAt", m."newId"
FROM "ProviderService" ps
JOIN "_provider_map" m ON m."oldId" = ps."providerId";

INSERT INTO "ServiceCost" ("id", "name", "description", "price", "isActive", "createdAt", "updatedAt", "clinicId")
SELECT gen_random_uuid()::text, sc."name", sc."description", sc."price", sc."isActive", sc."createdAt", sc."updatedAt", c."id"
FROM "ServiceCost" sc CROSS JOIN "Clinic" c
WHERE c."id" <> sc."clinicId";

INSERT INTO "PaymentMethod" ("id", "bank", "identify", "phone", "email", "account", "isActive", "createdAt", "updatedAt", "clinicId")
SELECT gen_random_uuid()::text, pm."bank", pm."identify", pm."phone", pm."email", pm."account", pm."isActive", pm."createdAt", pm."updatedAt", c."id"
FROM "PaymentMethod" pm CROSS JOIN "Clinic" c
WHERE c."id" <> pm."clinicId";

-- Campos personalizados huerfanos (los campos viejos no tenian dueno): a una
-- plantilla "General" del consultorio mas antiguo.
DO $$
DECLARE
    target_clinic TEXT;
    target_template TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM "CustomField") THEN
        SELECT "id" INTO target_clinic FROM "Clinic" ORDER BY "createdAt" ASC LIMIT 1;

        INSERT INTO "FormTemplate" ("id", "name", "condition", "description", "type", "isActive", "createdAt", "updatedAt", "clinicId")
        VALUES (gen_random_uuid()::text, 'General', NULL, 'Migrado de los campos personalizados anteriores', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, target_clinic)
        RETURNING "id" INTO target_template;

        UPDATE "CustomField" SET "templateId" = target_template;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Ahora si: NOT NULL + limpieza del modelo viejo
-- ---------------------------------------------------------------------------
ALTER TABLE "Patient" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "MedicalHistory" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "MedicalHistory" ALTER COLUMN "createdById" SET NOT NULL;
ALTER TABLE "Quote" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "Quote" ALTER COLUMN "createdById" SET NOT NULL;
ALTER TABLE "Quote" ALTER COLUMN "dolarId" SET NOT NULL;
ALTER TABLE "Provider" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "ServiceCost" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "PaymentMethod" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "CustomField" ALTER COLUMN "templateId" SET NOT NULL;

-- El tenant ya no es el User: se suprimen las FK y columnas userId
ALTER TABLE "MedicalHistory" DROP CONSTRAINT IF EXISTS "MedicalHistory_userId_fkey";
ALTER TABLE "Patient" DROP CONSTRAINT IF EXISTS "Patient_userId_fkey";
ALTER TABLE "Quote" DROP CONSTRAINT IF EXISTS "Quote_userId_fkey";

-- Estas dos cambian de ON DELETE RESTRICT a CASCADE: hay que recrearlas (seccion 7)
ALTER TABLE "ProviderService" DROP CONSTRAINT IF EXISTS "ProviderService_providerId_fkey";
ALTER TABLE "QuoteItem" DROP CONSTRAINT IF EXISTS "QuoteItem_quoteId_fkey";

ALTER TABLE "MedicalHistory" DROP COLUMN IF EXISTS "userId";
ALTER TABLE "Patient" DROP COLUMN IF EXISTS "userId";
ALTER TABLE "Quote" DROP COLUMN IF EXISTS "userId";

-- ---------------------------------------------------------------------------
-- 6. Indices
-- ---------------------------------------------------------------------------
CREATE INDEX "Clinic_isActive_idx" ON "Clinic"("isActive");
CREATE UNIQUE INDEX "Clinic_slug_key" ON "Clinic"("slug");
CREATE INDEX "ClinicUser_userId_idx" ON "ClinicUser"("userId");
CREATE INDEX "FormTemplate_clinicId_isActive_idx" ON "FormTemplate"("clinicId", "isActive");
CREATE UNIQUE INDEX "FormTemplate_clinicId_name_key" ON "FormTemplate"("clinicId", "name");
CREATE INDEX "CustomField_templateId_step_sortOrder_idx" ON "CustomField"("templateId", "step", "sortOrder");
CREATE INDEX "CustomField_templateId_isActive_idx" ON "CustomField"("templateId", "isActive");
CREATE INDEX "MedicalHistory_clinicId_createdAt_idx" ON "MedicalHistory"("clinicId", "createdAt");
CREATE INDEX "MedicalHistory_patientId_createdAt_idx" ON "MedicalHistory"("patientId", "createdAt");
CREATE INDEX "MedicalHistory_createdById_idx" ON "MedicalHistory"("createdById");
CREATE INDEX "Patient_clinicId_isActive_idx" ON "Patient"("clinicId", "isActive");
CREATE INDEX "Patient_clinicId_identify_idx" ON "Patient"("clinicId", "identify");
CREATE INDEX "PaymentMethod_clinicId_isActive_idx" ON "PaymentMethod"("clinicId", "isActive");
CREATE INDEX "Provider_clinicId_isActive_idx" ON "Provider"("clinicId", "isActive");
CREATE INDEX "ProviderService_providerId_isActive_idx" ON "ProviderService"("providerId", "isActive");
CREATE INDEX "Quote_clinicId_createdAt_idx" ON "Quote"("clinicId", "createdAt");
CREATE INDEX "Quote_patientId_idx" ON "Quote"("patientId");
CREATE INDEX "Quote_createdById_idx" ON "Quote"("createdById");
CREATE INDEX "QuoteItem_quoteId_idx" ON "QuoteItem"("quoteId");
CREATE INDEX "ServiceCost_clinicId_isActive_idx" ON "ServiceCost"("clinicId", "isActive");

-- ---------------------------------------------------------------------------
-- 7. Claves foraneas
-- ---------------------------------------------------------------------------
ALTER TABLE "ClinicUser" ADD CONSTRAINT "ClinicUser_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicUser" ADD CONSTRAINT "ClinicUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderService" ADD CONSTRAINT "ProviderService_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicalHistory" ADD CONSTRAINT "MedicalHistory_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicalHistory" ADD CONSTRAINT "MedicalHistory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- SET NULL: borrar una plantilla NUNCA destruye historia clinica
ALTER TABLE "MedicalHistory" ADD CONSTRAINT "MedicalHistory_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceCost" ADD CONSTRAINT "ServiceCost_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
