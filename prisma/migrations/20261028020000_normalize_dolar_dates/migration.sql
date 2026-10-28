-- Normaliza las tasas a dia calendario UTC y elimina duplicados previos
-- (misma fecha calendario + mismo valor). Se conserva la fila referenciada por
-- algun presupuesto; si no hay referencias, se conserva la captura mas reciente.

DELETE FROM "Dolar" a
WHERE NOT EXISTS (
    SELECT 1 FROM "Quote" q WHERE q."dolarId" = a.id
  )
  AND EXISTS (
    SELECT 1 FROM "Dolar" b
    WHERE b.id <> a.id
      AND b.date::date = a.date::date
      AND b.value = a.value
      AND (
        EXISTS (SELECT 1 FROM "Quote" q WHERE q."dolarId" = b.id)
        OR b."createdAt" > a."createdAt"
        OR (b."createdAt" = a."createdAt" AND b.id > a.id)
      )
  );

UPDATE "Dolar"
SET date = date_trunc('day', date);
