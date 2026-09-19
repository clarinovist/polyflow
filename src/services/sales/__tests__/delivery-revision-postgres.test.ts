import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/core/prisma', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const connection = process.env.SO_REVISION_TEST_DATABASE_URL;
    if (!connection) return { prisma: undefined };
    const url = new URL(connection);
    if (url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/polyflow_so_revision_test') {
        throw new Error('Requires disposable localhost polyflow_so_revision_test');
    }
    const client = new PrismaClient({ datasources: { db: { url: connection } } });
    return { prisma: client, getTenantDbFromContext: () => client };
});
// Keep real stock/quantity/reservation/audit DB writes; external GL and invoice creation
// are tested by their existing suites. Use real delivered invoice calculation below.
vi.mock('@/services/accounting/accounting-service', () => ({ AccountingService: { recordInventoryMovement: vi.fn() } }));
vi.mock('@/services/finance/invoice-service', () => ({ InvoiceService: { createDraftInvoiceFromOrder: vi.fn() } }));
vi.mock('@/services/finance/auto-journal-service', () => ({ AutoJournalService: {} }));
import { prisma as db } from '@/lib/core/prisma';
import { getDeliveryRevision, reviseDelivery } from '../delivery-revision-service';
import { commitDeliveryShipment, createDeliveryOrderFromSalesOrder } from '../delivery-fulfillment-service';
import { receiveDelivery } from '../delivery-receiving-service';
import { changeDeliveryLoad } from '../delivery-load-service';
import { calculateSalesInvoiceTotalFromDelivered } from '@/services/finance/invoice-lifecycle-service';
const actor = 'so-revision-actor';
async function seed() {
    const [identity] = await db.$queryRaw<{ name: string }[]>`SELECT current_database() name`;
    expect(identity.name).toBe('polyflow_so_revision_test');
    await db.$executeRaw`TRUNCATE "AuditLog", "StockReservation", "StockMovement", "Inventory", "DeliveryOrderItem", "DeliveryOrder", "SalesOrderItem", "SalesOrder", "Customer", "ProductVariant", "Product", "Location", "User" CASCADE`;
    await db.user.create({ data: { id: actor, email: 'revision@example.invalid', password: 'test-only', role: 'SALES' } });
    await db.customer.create({ data: { id: 'customer', name: 'Synthetic customer' } });
    await db.location.create({ data: { id: 'location', name: 'Synthetic warehouse', slug: 'revision-test' } });
    await db.product.create({ data: { id: 'product', name: 'Synthetic product', productType: 'FINISHED_GOOD' } });
    for (const id of ['a', 'b']) {
        await db.productVariant.create({ data: { id, productId: 'product', name: `Synthetic ${id}`, skuCode: `SO-REV-${id}`, primaryUnit: 'KG' } });
        await db.inventory.create({ data: { locationId: 'location', productVariantId: id, quantity: 200, averageCost: 5 } });
    }
    await db.salesOrder.create({ data: { id: 'so', orderNumber: 'SO-REV-TEST', customerId: 'customer', sourceLocationId: 'location', status: 'CONFIRMED', totalAmount: 1000,
        items: { create: { id: 'soi', productVariantId: 'a', quantity: 100, unitPrice: 10, subtotal: 1000 } } } });
    await db.deliveryOrder.create({ data: { id: 'do', orderNumber: 'DO-REV-TEST', salesOrderId: 'so', sourceLocationId: 'location', status: 'LOADING', loadVerifiedAt: new Date(),
        items: { create: { id: 'doi', productVariantId: 'a', quantity: 100, verifiedQuantity: 100 } } } });
    await db.stockReservation.create({ data: { productVariantId: 'a', locationId: 'location', quantity: 100, reservedFor: 'SALES_ORDER', referenceId: 'so', status: 'ACTIVE' } });
}
async function payload() {
    const editor = await getDeliveryRevision('do');
    return { deliveryOrderId: 'do', orderVersion: editor.orderVersion, deliveryVersion: editor.deliveryVersion,
        reason: 'Synthetic load correction', remainder: 'KEEP' as const, items: [{ salesOrderItemId: 'soi', quantity: 80 }], additions: [] };
}
async function verify(id = 'do') {
    const rows = await db.deliveryOrderItem.findMany({ where: { deliveryOrderId: id } });
    await changeDeliveryLoad(id, actor, { kind: 'verify', items: rows.map((row) => ({ id: row.id, verifiedQuantity: Number(row.quantity) })) });
    await changeDeliveryLoad(id, actor, { kind: 'lock' });
}
async function snapshot() {
    return JSON.stringify(await Promise.all([db.salesOrder.findMany({ include: { items: true } }), db.deliveryOrder.findMany({ include: { items: true } }), db.stockReservation.findMany(), db.inventory.findMany(), db.stockMovement.findMany(), db.auditLog.findMany()]));
}

describe.skipIf(!process.env.SO_REVISION_TEST_DATABASE_URL)('delivery revision on disposable PostgreSQL', () => {
    beforeEach(seed);
    afterAll(async () => { await db.$disconnect(); });
    it('partial ship -> receive -> second ship preserves demand, stock and delivered invoice total', async () => {
        await reviseDelivery(await payload(), actor);
        await expect(commitDeliveryShipment('do', actor)).rejects.toThrow(/Verifikasi/);
        await verify(); await commitDeliveryShipment('do', actor);
        expect((await db.salesOrder.findUniqueOrThrow({ where: { id: 'so' } })).status).toBe('READY_TO_SHIP');
        expect(await calculateSalesInvoiceTotalFromDelivered('so')).toBe(800);
        await receiveDelivery('do', actor);
        expect((await db.salesOrder.findUniqueOrThrow({ where: { id: 'so' } })).status).toBe('READY_TO_SHIP');
        const next = await createDeliveryOrderFromSalesOrder({ salesOrderId: 'so', sourceLocationId: 'location', userId: actor });
        expect(Number((await db.deliveryOrderItem.findFirstOrThrow({ where: { deliveryOrderId: next.id } })).quantity)).toBe(20);
        await verify(next.id); await commitDeliveryShipment(next.id, actor); await receiveDelivery(next.id, actor);
        expect((await db.salesOrder.findUniqueOrThrow({ where: { id: 'so' } })).status).toBe('DELIVERED');
        expect(Number((await db.inventory.findFirstOrThrow({ where: { productVariantId: 'a' } })).quantity)).toBe(100);
        expect(await calculateSalesInvoiceTotalFromDelivered('so')).toBe(1000);
    });
    it('replacement CLOSE changes both documents with real reservation reconciliation and stock only at ship', async () => {
        await reviseDelivery({ ...await payload(), remainder: 'CLOSE', additions: [{ productVariantId: 'b', quantity: 20, unitPrice: 15, taxPercent: 0, ppnMode: 'EXCLUDE' }] }, actor);
        expect(await db.stockMovement.count()).toBe(0);
        expect(Number((await db.salesOrder.findUniqueOrThrow({ where: { id: 'so' } })).totalAmount)).toBe(1100);
        expect(await db.auditLog.count({ where: { action: 'REVISE_DELIVERY_LOAD' } })).toBe(2);
        await verify(); await commitDeliveryShipment('do', actor);
        expect(Number((await db.inventory.findFirstOrThrow({ where: { productVariantId: 'a' } })).quantity)).toBe(120);
        expect(Number((await db.inventory.findFirstOrThrow({ where: { productVariantId: 'b' } })).quantity)).toBe(180);
        expect(await calculateSalesInvoiceTotalFromDelivered('so')).toBe(1100);
    });
    it('foreign-key audit failure rolls back SO, DO, reservation and verification together', async () => {
        const before = await snapshot();
        await expect(reviseDelivery({ ...await payload(), remainder: 'CLOSE' }, 'missing-actor')).rejects.toThrow();
        expect(await snapshot()).toBe(before);
    });
    it('only one concurrent revision succeeds for the same version', async () => {
        const data = await payload();
        const results = await Promise.allSettled([reviseDelivery(data, actor), reviseDelivery(data, actor)]);
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(await db.auditLog.count({ where: { action: 'REVISE_DELIVERY_LOAD' } })).toBe(2);
    });
    it('warehouse cannot approve a stale verification or mutate after shipment', async () => {
        await reviseDelivery(await payload(), actor);
        await expect(changeDeliveryLoad('do', actor, { kind: 'verify', items: [{ id: 'doi', verifiedQuantity: 100 }] })).rejects.toThrow(/berubah/);
        await verify(); await commitDeliveryShipment('do', actor);
        const item = await db.deliveryOrderItem.findFirstOrThrow({ where: { deliveryOrderId: 'do' } });
        await expect(changeDeliveryLoad('do', actor, { kind: 'quantity', items: [{ id: item.id, quantity: 70 }] })).rejects.toThrow(/PENDING/);
        expect(Number((await db.deliveryOrderItem.findUniqueOrThrow({ where: { id: item.id } })).quantity)).toBe(80);
    });
    it('shipping charges include prior partial DOs in transit', async () => {
        await reviseDelivery(await payload(), actor);
        await db.deliveryOrder.update({ where: { id: 'do' }, data: { totalCharge: 50 } });
        await verify(); await commitDeliveryShipment('do', actor);
        await db.deliveryOrder.update({ where: { id: 'do' }, data: { status: 'IN_TRANSIT' } });
        expect(await calculateSalesInvoiceTotalFromDelivered('so')).toBe(850);
    });
    it('revision racing shipment either invalidates verification or rejects; cannot alter shipped items', async () => {
        const data = await payload();
        const results = await Promise.allSettled([reviseDelivery(data, actor), commitDeliveryShipment('do', actor)]);
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const row = await db.deliveryOrder.findUniqueOrThrow({ where: { id: 'do' }, include: { items: true } });
        if (row.status === 'SHIPPED') expect(Number(row.items[0].quantity)).toBe(100);
        else { expect(row.loadVerifiedAt).toBeNull(); expect(await db.stockMovement.count()).toBe(0); }
    });
});
