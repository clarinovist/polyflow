export type OrderTotals = {
  gross: number;
  discount: number;
  tax: number;
  net: number;
};

type OrderLineItem = {
  quantity?: number;
  unitPrice?: number;
  discountPercent?: number;
  taxPercent?: number;
};

/**
 * Computes order totals from line items.
 * Shared by SalesOrderForm, SalesQuotationForm, PurchaseOrderForm, etc.
 */
export function computeOrderTotals(items: OrderLineItem[]): OrderTotals {
  return items.reduce(
    (acc, item) => {
      const qty = item.quantity || 0;
      const price = item.unitPrice || 0;
      const subtotal = qty * price;
      const discount = subtotal * ((item.discountPercent || 0) / 100);
      const taxable = subtotal - discount;
      const tax = taxable * ((item.taxPercent || 0) / 100);

      acc.gross += subtotal;
      acc.discount += discount;
      acc.tax += tax;
      acc.net += taxable + tax;
      return acc;
    },
    { gross: 0, discount: 0, tax: 0, net: 0 },
  );
}
