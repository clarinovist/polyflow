import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyReturnTestDatabase } from '@/services/finance/__tests__/return-credit-postgres-fixture';
vi.mock('@/lib/core/prisma', async () => {
    const { returnTestClient } = await import('@/services/finance/__tests__/return-credit-postgres-fixture');
    const url = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
    const client = url ? returnTestClient(url) : undefined;
    return { prisma: client, getTenantDbFromContext: () => client };
});
// Only non-mutation credit checks are isolated; actual processor, row writes,
// tenant transaction and logActivity use PostgreSQL (including audit FK failure).
vi.mock('../credit-service', () => ({ checkCreditLimit: vi.fn() }));
import { prisma as db } from '@/lib/core/prisma';
import { updateOrder } from '../orders-service';
import { updateSalesOrderSchema } from '@/lib/schemas/sales';
import { fieldEntryPayload } from '@/lib/sales/field-order-units';
import { salesEntryForEdit } from '@/lib/sales/unit-entry';

async function payload() {
    const order = await db.salesOrder.findUniqueOrThrow({ where: { id: 'uom-so' }, include: { items: { orderBy: { id: 'asc' } } } });
    return updateSalesOrderSchema.parse({
        id: order.id, expectedUpdatedAt: order.updatedAt, customerId: order.customerId, sourceLocationId: order.sourceLocationId,
        orderDate: order.orderDate, shippingCost: 0,
        items: order.items.map(i => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), enteredQuantity: Number(i.enteredQuantity), enteredUnitPrice: Number(i.enteredUnitPrice), conversionFactorSnapshot: Number(i.conversionFactorSnapshot), discountPercent: 0, taxPercent: 0, dppOtherAmount: null })),
    });
}
async function snapshot() {
    return JSON.stringify(await Promise.all([
        db.salesOrder.findMany({ include: { items: { orderBy: { id: 'asc' } } } }), db.auditLog.findMany(),
        db.deliveryScheduleOrder.findMany({ include: { plannedItems: true } }),
    ]));
}
describe.skipIf(!process.env.RETURN_CREDIT_TEST_DATABASE_URL)('SO unit edit / atomic audit PostgreSQL contract', () => {
    beforeEach(async () => {
        await verifyReturnTestDatabase(db);
        await db.$executeRaw`TRUNCATE "SalesOrder", "AuditLog", "ProductVariant", "Product", "User", "Location", "Customer", "DeliverySchedule" CASCADE`;
        await db.user.create({ data: { id: 'uom-actor', email: 'uom@example.invalid', password: 'synthetic', role: 'SALES' } });
        await db.customer.create({ data: { id: 'uom-customer', name: 'Synthetic' } });
        await db.location.create({ data: { id: 'uom-location', name: 'Synthetic', slug: 'uom-test' } });
        await db.product.create({ data: { id: 'uom-product', name: 'Synthetic', productType: 'FINISHED_GOOD' } });
        await db.productVariant.create({ data: { id: 'uom-variant', productId: 'uom-product', name: 'Synthetic', skuCode: 'UOM-FIXTURE', primaryUnit: 'KG', salesUnit: 'BAL', conversionFactor: 25 } });
        await db.salesOrder.create({ data: { id: 'uom-so', orderNumber: 'SO-UOM-FIXTURE', customerId: 'uom-customer', sourceLocationId: 'uom-location', status: 'CONFIRMED', priceStatus: 'FINAL', totalAmount: 400000,
            items: { create: ['uom-a', 'uom-b'].map(id => ({ id, productVariantId: 'uom-variant', quantity: 50, unitPrice: 4000, enteredQuantity: 2, enteredUnit: 'BAL', enteredUnitPrice: 100000, conversionFactorSnapshot: 25, subtotal: 200000 })) },
        } });
    });
    afterAll(async () => { await db?.$disconnect(); });
    it('changes one line, preserves another byte-for-byte and writes real before/after audit', async () => {
        const untouched = await db.salesOrderItem.findUniqueOrThrow({ where: { id: 'uom-b' } });
        const data = await payload(); data.items[0] = { ...data.items[0], quantity: 75, enteredQuantity: 3 };
        await updateOrder(data, 'uom-actor');
        expect(await db.salesOrderItem.findUniqueOrThrow({ where: { id: 'uom-b' } })).toEqual(untouched);
        const log = await db.auditLog.findFirstOrThrow({ where: { action: 'SALES_ORDER_UPDATED' } });
        expect(log.userId).toBe('uom-actor');
        const change = JSON.parse(log.changes as string);
        expect(change.before.items).toHaveLength(2); expect(change.after.items.find((item: { id: string }) => item.id === 'uom-a').quantity).toBe('75');
        expect(Number((await db.salesOrder.findUniqueOrThrow({ where: { id: 'uom-so' } })).totalAmount)).toBe(500000);
    });
    it('rejects overprecision entered snapshots, saves KG and reopens without quantity loss', async () => {
        const data = await payload();
        data.items[0] = { ...data.items[0], quantity: 1.001, unitPrice: 22000, enteredQuantity: 0.04004, enteredUnitPrice: 550000, enteredUnit: 'BAL', conversionFactorSnapshot: 25 };
        const before = await snapshot();
        await expect(updateOrder(data, 'uom-actor')).rejects.toThrow(/disimpan tepat/);
        expect(await snapshot()).toBe(before);
        data.items[0] = { ...data.items[0], enteredQuantity: 1.001, enteredUnitPrice: 22000, enteredUnit: 'KG', conversionFactorSnapshot: 1 };
        await updateOrder(data, 'uom-actor');
        const saved = await db.salesOrderItem.findUniqueOrThrow({ where: { id: 'uom-a' } });
        expect(Number(saved.quantity)).toBe(1.001); expect(Number(saved.subtotal)).toBe(22022);
        await updateOrder(await payload(), 'uom-actor');
        expect(await db.salesOrderItem.findUniqueOrThrow({ where: { id: 'uom-a' } })).toEqual(saved);
    });
    it('notes-only edit preserves legacy rounded base price and stored total', async () => {
        await db.productVariant.update({ where: { id: 'uom-variant' }, data: { conversionFactor: 3 } });
        await db.salesOrderItem.update({ where: { id: 'uom-a' }, data: { quantity: 3, unitPrice: 33.33, enteredQuantity: 1, enteredUnitPrice: 100, conversionFactorSnapshot: 3, subtotal: 100 } });
        await db.salesOrder.update({ where: { id: 'uom-so' }, data: { totalAmount: 200100 } });
        const saved = await db.salesOrderItem.findUniqueOrThrow({ where: { id: 'uom-a' } });
        await updateOrder({ ...await payload(), notes: 'Synthetic updated note' }, 'uom-actor');
        expect(await db.salesOrderItem.findUniqueOrThrow({ where: { id: 'uom-a' } })).toEqual(saved);
        expect(Number((await db.salesOrder.findUniqueOrThrow({ where: { id: 'uom-so' } })).totalAmount)).toBe(200100);
        const changed = await payload(); changed.items[0].enteredUnitPrice = 101;
        await expect(updateOrder(changed, 'uom-actor')).rejects.toThrow();
    });
    it('field mobile KG/BAL payload round-trips through persistence and desktop mapping', async () => {
        const units = { primaryUnit: 'KG' as const, salesUnit: 'BAL' as const, conversionFactor: 25 };
        const data = await payload();
        data.items[0] = { ...data.items[0], ...fieldEntryPayload({ productVariantId: 'uom-variant', quantity: 3, unitPrice: 100000, enteredUnit: 'BAL' }, units) };
        await updateOrder(data, 'uom-actor');
        const saved = await db.salesOrderItem.findUniqueOrThrow({ where: { id: 'uom-a' } });
        expect(Number(saved.quantity)).toBe(75);
        const reopened = { id: saved.id, productVariantId: saved.productVariantId, ...salesEntryForEdit({ ...saved, productVariant: units }) };
        expect(reopened).toMatchObject({ quantity: 3, unitPrice: 100000, enteredUnit: 'BAL' });
        const second = await payload();
        second.items[0] = { ...second.items[0], ...fieldEntryPayload(reopened, units, reopened) };
        await updateOrder(second, 'uom-actor');
        expect(await db.salesOrderItem.findUniqueOrThrow({ where: { id: 'uom-a' } })).toEqual(saved);
    });
    it('rejects tiny positive quantities before PostgreSQL can round them to zero', async () => {
        const data = await payload();
        data.items[0] = { ...data.items[0], quantity: 1e-10, enteredQuantity: 1e-10, enteredUnit: 'KG', conversionFactorSnapshot: 1, unitPrice: 18500, enteredUnitPrice: 18500 };
        const before = await snapshot();
        await expect(updateOrder(data, 'uom-actor')).rejects.toThrow(/terlalu kecil/);
        expect(await snapshot()).toBe(before);
        expect(await db.salesOrderItem.count({ where: { quantity: 0 } })).toBe(0);
    });
    it('audit FK failure rolls back item/header writes', async () => {
        const data = await payload(); data.items[0] = { ...data.items[0], quantity: 75, enteredQuantity: 3 };
        const before = await snapshot();
        await expect(updateOrder(data, 'missing-actor')).rejects.toThrow();
        expect(await snapshot()).toBe(before);
    });
    it('only one concurrent edit succeeds and stale page retries cannot overwrite it', async () => {
        const data = await payload(); data.items[0] = { ...data.items[0], quantity: 75, enteredQuantity: 3 };
        const results = await Promise.allSettled([updateOrder(data, 'uom-actor'), updateOrder(data, 'uom-actor')]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(await db.auditLog.count({ where: { action: 'SALES_ORDER_UPDATED' } })).toBe(1);
        await expect(updateOrder(data, 'uom-actor')).rejects.toThrow(/berubah/);
    });
    it('historical factor survives changed master and wrong/duplicate IDs fail closed', async () => {
        await db.productVariant.update({ where: { id: 'uom-variant' }, data: { conversionFactor: 50, salesUnit: 'ZAK' } });
        const data = await payload();
        await updateOrder(data, 'uom-actor');
        expect(Number((await db.salesOrderItem.findUniqueOrThrow({ where: { id: 'uom-a' } })).quantity)).toBe(50);
        const invalid = await payload(); invalid.items[0].id = 'foreign-item';
        await expect(updateOrder(invalid, 'uom-actor')).rejects.toThrow(/ID item/);
        invalid.items[0].id = invalid.items[1].id;
        await expect(updateOrder(invalid, 'uom-actor')).rejects.toThrow(/ID item/);
    });
});
