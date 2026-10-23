import { describe, expect, it } from 'vitest';
import { Prisma, type SalesOrderItem } from '@prisma/client';
import { unchangedSalesLine, salesEditAuditSnapshot } from '../order-edit-diff';

describe('sales edit diff and audit projection', () => {
    const input = { productVariantId: 'variant', quantity: 3, unitPrice: 33.33, enteredUnit: 'BAL', enteredQuantity: 1, enteredUnitPrice: 100, conversionFactorSnapshot: 3, discountPercent: 0, taxPercent: 0, dppOtherAmount: null, ppnMode: 'EXCLUDE', isFreeItem: false };
    const old = { ...input, quantity: new Prisma.Decimal(3), unitPrice: new Prisma.Decimal(33.33), subtotal: new Prisma.Decimal(100) } as unknown as SalesOrderItem;
    it('compares all commercial fields without recalculating historical subtotal', () => {
        expect(unchangedSalesLine(old, input)).toBe(true);
        for (const patch of [{ productVariantId: 'other' }, { quantity: 4 }, { unitPrice: 34 }, { enteredUnit: 'KG' }, { enteredQuantity: 2 }, { enteredUnitPrice: 101 }, { conversionFactorSnapshot: 25 }, { discountPercent: 1 }, { taxPercent: 11 }, { dppOtherAmount: 50 }, { ppnMode: 'INCLUDE' }, { isFreeItem: true }]) {
            expect(unchangedSalesLine(old, { ...input, ...patch })).toBe(false);
        }
        const legacy = { ...old, enteredUnit: null, enteredQuantity: null, enteredUnitPrice: null, conversionFactorSnapshot: null };
        expect(unchangedSalesLine(legacy, { productVariantId: 'variant', quantity: 3, unitPrice: 33.33 })).toBe(true);
    });
    it('serializes audit money and omits sensitive free text', () => {
        const audit = salesEditAuditSnapshot({ id: 'order', totalAmount: new Prisma.Decimal(100), notes: 'Private note', customer: { email: 'private@example.invalid' }, items: [old] });
        expect(audit.totalAmount).toBe('100');
        expect(audit).not.toHaveProperty('notes'); expect(audit).not.toHaveProperty('customer');
        expect(audit.textFieldsPresent).toMatchObject({ notes: true });
    });
});
