-- Resolver drift preexistente: ADMIN ya esta en schema.prisma pero nunca se agrego
-- al historial de migraciones. IF NOT EXISTS mantiene la migracion re-ejecutable.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADMIN';

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- AlterTable: nuevas columnas escalares de Quote
ALTER TABLE "Quote"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "exchangeRate" DECIMAL(12,4),
  ADD COLUMN "subtotal" DECIMAL(12,2),
  ADD COLUMN "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "rootQuoteId" TEXT,
  ADD COLUMN "supersedesId" TEXT,
  ADD COLUMN "supersededAt" TIMESTAMP(3),
  ADD COLUMN "issuedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "paymentMethodId" TEXT;

-- Convertir status TEXT -> QuoteStatus mapeando los valores historicos.
ALTER TABLE "Quote" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Quote" ALTER COLUMN "status" TYPE "QuoteStatus" USING (
  CASE lower("status")
    WHEN 'pending' THEN 'DRAFT'::"QuoteStatus"
    WHEN 'draft' THEN 'DRAFT'::"QuoteStatus"
    WHEN 'sent' THEN 'SENT'::"QuoteStatus"
    WHEN 'approved' THEN 'APPROVED'::"QuoteStatus"
    WHEN 'rejected' THEN 'REJECTED'::"QuoteStatus"
    WHEN 'expired' THEN 'EXPIRED'::"QuoteStatus"
    WHEN 'cancelled' THEN 'CANCELLED'::"QuoteStatus"
    ELSE 'DRAFT'::"QuoteStatus"
  END
);
ALTER TABLE "Quote" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- Backfill: tasa desde la fila Dolar referenciada.
UPDATE "Quote" q
SET "exchangeRate" = d."value"
FROM "Dolar" d
WHERE d."id" = q."dolarId";

UPDATE "Quote" SET "exchangeRate" = 0 WHERE "exchangeRate" IS NULL;
ALTER TABLE "Quote" ALTER COLUMN "exchangeRate" SET NOT NULL;

-- Backfill: subtotal desde los items; si no hay items se conserva el total viejo.
UPDATE "Quote" q
SET "subtotal" = COALESCE(
  (SELECT SUM(qi."total") FROM "QuoteItem" qi WHERE qi."quoteId" = q."id"),
  q."total",
  0
);
ALTER TABLE "Quote" ALTER COLUMN "subtotal" SET NOT NULL;

-- El total deja de confiar en el cliente: se deriva de los items y los ajustes.
UPDATE "Quote"
SET "total" = "subtotal" - "discount" + "tax";

-- Backfill de version raiz: la primera version se referencia a si misma.
UPDATE "Quote" SET "rootQuoteId" = "id" WHERE "rootQuoteId" IS NULL;

-- CreateIndex / AddForeignKey
CREATE UNIQUE INDEX "Quote_supersedesId_key" ON "Quote"("supersedesId");
CREATE INDEX "Quote_clinicId_supersededAt_createdAt_idx" ON "Quote"("clinicId", "supersededAt", "createdAt");
CREATE INDEX "Quote_rootQuoteId_version_idx" ON "Quote"("rootQuoteId", "version");
CREATE INDEX "Quote_paymentMethodId_idx" ON "Quote"("paymentMethodId");

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_rootQuoteId_fkey"
  FOREIGN KEY ("rootQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_supersedesId_fkey"
  FOREIGN KEY ("supersedesId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_paymentMethodId_fkey"
  FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: QuoteItem
ALTER TABLE "QuoteItem"
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "serviceCostId" TEXT,
  ADD COLUMN "providerServiceId" TEXT;

CREATE INDEX "QuoteItem_serviceCostId_idx" ON "QuoteItem"("serviceCostId");
CREATE INDEX "QuoteItem_providerServiceId_idx" ON "QuoteItem"("providerServiceId");

ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_serviceCostId_fkey"
  FOREIGN KEY ("serviceCostId") REFERENCES "ServiceCost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_providerServiceId_fkey"
  FOREIGN KEY ("providerServiceId") REFERENCES "ProviderService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
