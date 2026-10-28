-- date_trunc('day', timestamp) usa la zona horaria de la sesion. El servicio
-- guarda dias calendario UTC, asi que se trunca con el cast a date (sin zona).
UPDATE "Dolar"
SET date = date::date;
