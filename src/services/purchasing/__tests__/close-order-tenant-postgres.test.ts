import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Never allow this integration test's fallback client to reach an application DB.
vi.hoisted(() => { process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:1/polyflow_po_close_fallback_test?connect_timeout=1'; });
import { closeOrder } from '../close-order-service';
import { updateOrder, updateOrderStatus } from '../orders-service';
import { createGoodsReceipt, closePurchaseOrderWithDiscrepancy } from '../receipts-service';
import { tenantContext, getMainPrisma } from '@/lib/core/prisma';
import { withStatusAudit } from '@/lib/core/prisma-audit-extension';

function testClient(name: string) {
    const connection = process.env.PO_CLOSE_TEST_DATABASE_URL;
    if (!connection) return null;
    const url = new URL(connection);
    if (url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/polyflow_po_close_test') throw Error('Dedicated disposable loopback DB required');
    url.pathname = `/${name}`;
    return withStatusAudit(new PrismaClient({ datasources: { db: { url: url.toString() } } }));
}
const first = testClient('polyflow_po_close_test');
const second = testClient('polyflow_po_close_tenant_test');
async function seed(db: PrismaClient) {
    const [identity] = await db.$queryRaw<{ name: string }[]>`SELECT current_database() name`;
    if (!['polyflow_po_close_test', 'polyflow_po_close_tenant_test'].includes(identity.name)) throw Error('Unsafe DB');
    await db.$executeRaw`TRUNCATE "AuditLog", "PurchaseOrder", "Supplier", "Product", "User" CASCADE`;
    await db.user.create({ data: { id: 'actor', email: 'po-tenant@example.invalid', password: 'synthetic', role: 'PROCUREMENT' } });
    await db.supplier.create({ data: { id: 'supplier', name: 'Synthetic supplier' } });
    await db.product.create({ data: { id: 'product', name: 'Synthetic product', productType: 'RAW_MATERIAL' } });
    await db.productVariant.create({ data: { id: 'variant', productId: 'product', skuCode: 'PO-TENANT', name: 'Synthetic variant', primaryUnit: 'KG' } });
    await db.purchaseOrder.create({ data: { id: 'same-po', orderNumber: 'PO-SAME-ID', supplierId: 'supplier', status: 'PARTIAL_RECEIVED', items: { create: { id: 'item', productVariantId: 'variant', quantity: 10, receivedQty: 4, unitPrice: 10, subtotal: 100 } } } });
}

describe.skipIf(!first || !second)('actual PO close tenant context and audit extension', () => {
    beforeEach(async () => { await seed(first!); await seed(second!); });
    afterAll(async () => { await first?.$disconnect(); await second?.$disconnect(); await getMainPrisma().$disconnect(); });
    it('routes close transaction to active tenant, not control DB, and isolates identical IDs', async () => {
        await tenantContext.run(first!, () => closeOrder('same-po', 'Tenant one closes remainder', 'actor'));
        expect((await first!.purchaseOrder.findUniqueOrThrow({ where: { id: 'same-po' } })).status).toBe('CLOSED');
        expect((await second!.purchaseOrder.findUniqueOrThrow({ where: { id: 'same-po' } })).status).toBe('PARTIAL_RECEIVED');
        expect(await first!.auditLog.count()).toBe(1);
        expect(await second!.auditLog.count()).toBe(0);
    });
    it('tenant-bound receive/edit/status/legacy close all reject CLOSED without falling back to control DB', async () => {
        await tenantContext.run(first!, () => closeOrder('same-po', 'reason', 'actor'));
        await tenantContext.run(first!, async () => {
            await expect(updateOrderStatus('same-po', 'SENT', 'actor')).rejects.toThrow(/Ditutup/);
            await expect(updateOrder({ id: 'same-po', items: [] } as never)).rejects.toThrow(/CLOSED/);
            await expect(closePurchaseOrderWithDiscrepancy('same-po', 'actor')).rejects.toThrow(/CLOSED/);
            await expect(createGoodsReceipt({ purchaseOrderId: 'same-po', locationId: 'unused', receivedDate: new Date(), isMaklon: false, notes: '', items: [] }, 'actor')).rejects.toThrow(/ditutup/);
        });
        expect((await second!.purchaseOrder.findUniqueOrThrow({ where: { id: 'same-po' } })).status).toBe('PARTIAL_RECEIVED');
    });
    it('rejects missing tenant context before touching fallback DB', async () => {
        await expect(closeOrder('same-po', 'reason', 'actor')).rejects.toThrow(/tenant/i);
    });
    it('real audit failure rolls back with extension enabled and no phantom audit', async () => {
        await expect(tenantContext.run(first!, () => closeOrder('same-po', 'reason', 'missing-actor'))).rejects.toThrow();
        expect((await first!.purchaseOrder.findUniqueOrThrow({ where: { id: 'same-po' } })).status).toBe('PARTIAL_RECEIVED');
        expect(await first!.auditLog.count()).toBe(0);
    });
});
