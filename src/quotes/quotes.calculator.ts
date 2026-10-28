import { Prisma } from '../generated/prisma/client';

/**
 * Precisión monetaria del presupuesto.
 *
 * Regla de redondeo: HALF_UP (0.005 sube) a 2 decimales.
 * Se redondea primero cada línea (unitPrice × quantity), luego el subtotal,
 * el descuento, el impuesto y finalmente el total. De esta forma el total que
 * ve el cliente siempre coincide con la suma de las líneas redondeadas.
 */
export const MONEY_SCALE = 2;

export type DecimalInput = Prisma.Decimal | number | string;

export interface QuoteItemCalculationInput {
  unitPrice: DecimalInput;
  quantity: number;
}

export interface QuoteTotalsInput {
  items: ReadonlyArray<QuoteItemCalculationInput>;
  discount?: DecimalInput | null;
  tax?: DecimalInput | null;
}

export interface CalculatedQuoteItem<
  T extends QuoteItemCalculationInput,
> extends QuoteItemCalculationInput {
  source: T;
  total: Prisma.Decimal;
}

export interface QuoteTotals<T extends QuoteItemCalculationInput> {
  items: Array<T & { total: Prisma.Decimal }>;
  subtotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
}

function money(value: DecimalInput): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(
    MONEY_SCALE,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

export function calculateQuoteTotals<T extends QuoteItemCalculationInput>(
  input: QuoteTotalsInput & { items: ReadonlyArray<T> },
): QuoteTotals<T> {
  const items = input.items.map((item) => ({
    ...item,
    total: money(new Prisma.Decimal(item.unitPrice).times(item.quantity)),
  })) as Array<T & { total: Prisma.Decimal }>;

  const subtotal = money(
    items.reduce((sum, item) => sum.plus(item.total), new Prisma.Decimal(0)),
  );
  const discount = money(input.discount ?? 0);
  const tax = money(input.tax ?? 0);
  const total = money(subtotal.minus(discount).plus(tax));

  return { items, subtotal, discount, tax, total };
}
