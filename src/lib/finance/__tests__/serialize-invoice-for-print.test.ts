import { describe, expect, it } from 'vitest';
import { serializeInvoiceForPrint } from '../serialize-invoice-for-print';

function buildRawInvoice(overrides: Record<string, unknown> = {}) {
    return {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        totalAmount: '1100000.00',
        paidAmount: '100000.00',
        creditedAmount: '50000.00',
        priceAdjustmentAmount: '25000.00',
        salesOrder: {
            id: 'so-1',
            orderNumber: 'SO-001',
            taxAmount: '100000.00',
            customer: { name: 'PT Contoh' },
            items: [
                {
                    id: 'item-1',
                    quantity: '8.5',
                    unitPrice: '100000.00',
                    subtotal: '850000.00',
                    enteredQuantity: '1.5',
                    enteredUnitPrice: '500000.00',
                    productVariant: { name: 'Produk Contoh' },
                },
            ],
        },
        ...overrides,
    };
}

describe('serializeInvoiceForPrint', () => {
    it('converts decimal money fields to numbers', () => {
        const result = serializeInvoiceForPrint(buildRawInvoice());

        expect(result).toMatchObject({
            totalAmount: 1100000,
            paidAmount: 100000,
            creditedAmount: 50000,
            priceAdjustmentAmount: 25000,
        });
    });

    it('defaults missing credit and price adjustment to zero', () => {
        const result = serializeInvoiceForPrint(
            buildRawInvoice({
                creditedAmount: null,
                priceAdjustmentAmount: undefined,
            }),
        );

        expect(result).toMatchObject({
            creditedAmount: 0,
            priceAdjustmentAmount: 0,
        });
    });

    it('converts order tax and item amounts, keeping the customer untouched', () => {
        const raw = buildRawInvoice();

        const result = serializeInvoiceForPrint(raw) as {
            salesOrder: {
                taxAmount: number;
                customer: unknown;
                items: Record<string, unknown>[];
            };
        };

        expect(result.salesOrder.taxAmount).toBe(100000);
        expect(result.salesOrder.customer).toBe(raw.salesOrder.customer);
        expect(result.salesOrder.items[0]).toMatchObject({
            id: 'item-1',
            quantity: 8.5,
            unitPrice: 100000,
            subtotal: 850000,
            enteredQuantity: 1.5,
            enteredUnitPrice: 500000,
            productVariant: { name: 'Produk Contoh' },
        });
    });

    it('treats a missing order tax as zero', () => {
        const raw = buildRawInvoice();
        const result = serializeInvoiceForPrint({
            ...raw,
            salesOrder: { ...raw.salesOrder, taxAmount: null },
        }) as { salesOrder: { taxAmount: number } };

        expect(result.salesOrder.taxAmount).toBe(0);
    });

    it('leaves entered quantity and price undefined when the item has none', () => {
        const raw = buildRawInvoice();
        const result = serializeInvoiceForPrint({
            ...raw,
            salesOrder: {
                ...raw.salesOrder,
                items: [
                    {
                        id: 'item-2',
                        quantity: '2',
                        unitPrice: '10.00',
                        subtotal: '20.00',
                        enteredQuantity: null,
                        enteredUnitPrice: undefined,
                    },
                ],
            },
        }) as { salesOrder: { items: Record<string, unknown>[] } };

        expect(result.salesOrder.items[0].enteredQuantity).toBeUndefined();
        expect(result.salesOrder.items[0].enteredUnitPrice).toBeUndefined();
        expect(result.salesOrder.items[0].quantity).toBe(2);
    });

    it('returns an undefined sales order for a legacy invoice without one', () => {
        const result = serializeInvoiceForPrint(
            buildRawInvoice({ salesOrder: null }),
        );

        expect(result.salesOrder).toBeUndefined();
    });

    it('keeps items undefined when the order carries none', () => {
        const raw = buildRawInvoice();
        const result = serializeInvoiceForPrint({
            ...raw,
            salesOrder: { ...raw.salesOrder, items: undefined },
        }) as { salesOrder: { items?: unknown } };

        expect(result.salesOrder.items).toBeUndefined();
    });

    it('preserves unrelated fields and does not mutate the input', () => {
        const raw = buildRawInvoice();
        const snapshot = JSON.parse(JSON.stringify(raw));

        const result = serializeInvoiceForPrint(raw);

        expect(result.invoiceNumber).toBe('INV-001');
        expect(result).not.toBe(raw);
        expect(JSON.parse(JSON.stringify(raw))).toEqual(snapshot);
        expect(raw.totalAmount).toBe('1100000.00');
    });
});
