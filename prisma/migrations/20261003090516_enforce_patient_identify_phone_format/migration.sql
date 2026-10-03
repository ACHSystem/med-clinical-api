-- Normaliza Patient.identify al formato V-12345678 y Patient.phone al formato +581234567890,
-- y añade CHECK constraints para que el formato no se vuelva a romper.

UPDATE "Patient" SET "identify" = 'V-12345678', "phone" = '+581234567890' WHERE "id" = '8dcd8958-6cdf-4c1e-a704-3daf7f9269ab';
UPDATE "Patient" SET "identify" = 'V-23456789', "phone" = '+581234567891' WHERE "id" = 'fde674eb-089c-4fc7-8061-b40d513be9a5';
UPDATE "Patient" SET "identify" = 'V-34567890', "phone" = '+581234567892' WHERE "id" = '3f60ba45-c023-4050-ba17-c741e1bf218f';
UPDATE "Patient" SET "identify" = 'V-45678901', "phone" = '+581234567893' WHERE "id" = '3d9ffd18-c54d-4b3b-9a20-1fb68d7bba92';
UPDATE "Patient" SET "identify" = 'V-56789012', "phone" = '+581234567894' WHERE "id" = 'a0c51157-207b-4d4b-9a78-891342bd47d8';
UPDATE "Patient" SET "identify" = 'V-67890123', "phone" = '+581234567895' WHERE "id" = 'a37dc01a-753f-4192-a37f-a0fb8fb30ff6';
UPDATE "Patient" SET "identify" = 'V-78901234', "phone" = '+581234567896' WHERE "id" = 'e7f89495-b1f1-4b90-be67-5edff4ab4cda';
UPDATE "Patient" SET "identify" = 'V-89012345', "phone" = '+581234567897' WHERE "id" = '1638c60c-d8f4-44ee-bae8-a064dff0d3b1';
UPDATE "Patient" SET "identify" = 'V-90123456', "phone" = '+581234567898' WHERE "id" = 'f8f44dc1-af86-48b9-a070-a2e3d0790da0';
UPDATE "Patient" SET "identify" = 'V-28391325', "phone" = '+584165610813' WHERE "id" = 'f871f693-8789-4f80-a95d-b7158a11917d';
UPDATE "Patient" SET "identify" = 'V-29965990', "phone" = '+584165610813' WHERE "id" = 'a74e1390-0c4d-44ed-9b4d-2011de534726';

-- Cualquier otra fila que no cumpla el formato se normaliza de forma determinista:
-- prefijo V- + los ultimos 8 digitos de la cedula, y +58 + los ultimos 10 digitos del telefono.
UPDATE "Patient"
SET "identify" = 'V-' || substring("identify" from '[0-9]+$')
WHERE "identify" !~ '^[VE]-[0-9]{8}$';

UPDATE "Patient"
SET "phone" = '+58' || right(regexp_replace("phone", '\D', '', 'g'), 10)
WHERE "phone" IS NOT NULL AND "phone" !~ '^\+58[0-9]{10}$';

ALTER TABLE "Patient" DROP CONSTRAINT IF EXISTS "Patient_identify_format_check";
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_identify_format_check"
  CHECK ("identify" ~ '^[VE]-[0-9]{8}$');

ALTER TABLE "Patient" DROP CONSTRAINT IF EXISTS "Patient_phone_format_check";
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_phone_format_check"
  CHECK ("phone" IS NULL OR "phone" ~ '^\+58[0-9]{10}$');