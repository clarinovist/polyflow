import { describe, expect, it } from 'vitest';
import {
    toPriceFreePurchaseOrder,
    type RawPurchaseOrder,
} from '../purchase-order-price-redaction';

const rawOrder = {
    id: 'po-1',
    orderNumber: 'PO-001',
    status: 'SENT',
    orderDate: new Date('2026-11-01T00:00:00Z'),
    expectedDate: null,
    deliveryAddress: 'Gudang 1',
    notes: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    createdBy: { name: 'Admin' },
    totalAmount: 1_500_000,
    discountAmount: 10_000,
    taxAmount: 165_000,
    shippingCost: 20_000,
    supplier: {
        id: 's-1',
        name: 'Supplier A',
        code: 'SUP-A',
        paymentTermDays: 30,
        bankAccount: '123-456',
    },
    items: [
        {
            id: 'i-1',
            productVariantId: 'v-1',
            quantity: 10,
            receivedQty: 4,
            unitPrice: 150_000,
            subtotal: 1_500_000,
            dppOtherAmount: 1_375_000,
            taxPercent: 11,
            taxAmount: 165_000,
            discountPercent: 5,
            productVariant: {
                id: 'v-1',
                name: 'Resin',
                skuCode: 'RSN-1',
                primaryUnit: 'KG',
                buyPrice: 99_000,
            },
        },
    ],
    goodsReceipts: [
        {
            id: 'gr-1',
            receiptNumber: 'GR-001',
            receivedDate: new Date('2026-11-02T00:00:00Z'),
            location: { name: 'Gudang' },
            createdBy: { name: 'Operator' },
            totalValue: 600_000,
        },
    ],
    invoices: [{ id: 'inv-1', invoiceNumber: 'INV-1', totalAmount: 1_500_000 }],
} as unknown as RawPurchaseOrder;

describe('toPriceFreePurchaseOrder', () => {
    it('keeps operational fields and quantities', () => {
        const view = toPriceFreePurchaseOrder(rawOrder);

        expect(view).toMatchObject({
            id: 'po-1',
            orderNumber: 'PO-001',
            status: 'SENT',
            deliveryAddress: 'Gudang 1',
        });
        expect(view.items[0]).toMatchObject({
            id: 'i-1',
            quantity: 10,
            receivedQty: 4,
        });
        expect(view.items[0].productVariant).toEqual({
            id: 'v-1',
            name: 'Resin',
            skuCode: 'RSN-1',
            primaryUnit: 'KG',
        });
        expect(view.goodsReceipts[0].receiptNumber).toBe('GR-001');
    });

    it('zeroes every price field and drops invoices', () => {
        const view = toPriceFreePurchaseOrder(rawOrder);

        expect(view.totalAmount).toBeNull();
        expect(view.discountAmount).toBe(0);
        expect(view.taxAmount).toBe(0);
        expect(view.shippingCost).toBe(0);
        expect(view.invoices).toEqual([]);
        expect(view.items[0]).toMatchObject({
            unitPrice: 0,
            subtotal: 0,
            dppOtherAmount: null,
            taxPercent: 0,
            taxAmount: 0,
            discountPercent: 0,
        });
        expect(view.supplier.paymentTermDays).toBeNull();
    });

    it('does not leak price values or unrelated nested fields anywhere in the payload', () => {
        const serialized = JSON.stringify(toPriceFreePurchaseOrder(rawOrder));

        for (const secret of ['1500000', '150000', '165000', '99000', '600000', '123-456']) {
            expect(serialized).not.toContain(secret);
        }
    });

    it('does not mutate the source order', () => {
        const before = JSON.stringify(rawOrder);

        toPriceFreePurchaseOrder(rawOrder);

        expect(JSON.stringify(rawOrder)).toBe(before);
    });
});
