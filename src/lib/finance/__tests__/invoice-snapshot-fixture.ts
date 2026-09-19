import type { InvoiceSnapshot } from '../invoice-snapshot';
export function snapshotFixture(overrides: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot {
    return {
        version: 1, basis: 'DELIVERED', orderNumber: 'SO-test', customer: { name: 'Original customer', billingAddress: null, taxId: null, phone: null, email: null },
        items: [{ sourceItemId: 'item', productVariantId: 'a', name: 'Original A', skuCode: 'A', unit: 'KG', quantity: 80, unitPrice: '10.00', discountPercent: 0, taxPercent: 10, ppnMode: 'EXCLUDE',
            discountAmount: '0.00', netAmount: '800.00', taxAmount: '80.00', totalAmount: '880.00', enteredUnit: 'ZAK', conversionFactor: 10, enteredQuantity: 8, enteredUnitPrice: '100.00', revenueAccountId: 'revenue-a',
            product: { id: 'p', name: 'Product A', revenueAccountId: null } }],
        shippingAmount: '20.00', discountAmount: '0.00', taxAmount: '80.00', commercialTotal: '900.00', ...overrides,
    };
}
