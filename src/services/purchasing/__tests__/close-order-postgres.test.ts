import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';

vi.mock('@/lib/core/prisma', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const connection = process.env.PO_CLOSE_TEST_DATABASE_URL;
    if (!connection) return { prisma: undefined };
    const url = new URL(connection);
    if (url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/polyflow_po_close_test') {
        throw new Error('PO close tests require an explicit disposable localhost polyflow_po_close_test');
    }
    const prisma = new PrismaClient({ datasources: { db: { url: connection } } });
    return { prisma, getTenantDbFromContext: () => prisma };
});
// Keep receipt persistence/quantity logic real, but isolate external stock/GL effects.
// Close itself never invokes these services; snapshots also cover existing records.
vi.mock('@/services/inventory/core-service', () => ({ InventoryCoreService: { incrementStockWithCost: vi.fn() } }));
vi.mock('@/services/accounting/accounting-service', () => ({ AccountingService: { recordInventoryMovement: vi.fn() } }));
vi.mock('@/services/purchasing/invoices-service', () => ({ createDraftBillFromPo: vi.fn() }));
vi.mock('@/services/accounting/account-resolver', () => ({ resolveAccount: vi.fn(async () => ({ id: 'account', code: 'TEST', name: 'Synthetic account' })) }));
import { prisma as db } from '@/lib/core/prisma';
import { closeOrder } from '../close-order-service';
import { updateOrder, updateOrderStatus, deleteOrder } from '../orders-service';
import { createGoodsReceipt, reverseGoodsReceipt, closePurchaseOrderWithDiscrepancy } from '../receipts-service';
import { listReceivablePurchaseOrders } from '../walk-in-receipt-service';

const actor = 'po-close-actor';
async function seed() {
    const [identity] = await db.$queryRaw<{ name: string }[]>`SELECT current_database() name`;
    expect(identity.name).toBe('polyflow_po_close_test');
    await db.$executeRaw`TRUNCATE "AuditLog", "JournalLine", "JournalEntry", "StockMovement", "Inventory", "GoodsReceiptItem", "GoodsReceipt", "PurchaseOrderItem", "PurchaseOrder", "PurchaseInvoice", "Supplier", "ProductVariant", "Product", "Location", "Account", "User" CASCADE`;
    await db.user.create({ data: { id: actor, email: 'po-close@example.invalid', password: 'test-only', role: 'PROCUREMENT' } });
    await db.supplier.create({ data: { id: 'supplier', name: 'Synthetic supplier' } });
    await db.location.create({ data: { id: 'location', name: 'Synthetic location', slug: 'po-close-location' } });
    await db.product.create({ data: { id: 'product', name: 'Synthetic product', productType: 'RAW_MATERIAL' } });
    await db.productVariant.create({ data: { id: 'variant', productId: 'product', name: 'Synthetic variant', skuCode: 'PO-CLOSE', primaryUnit: 'KG' } });
    await db.purchaseOrder.create({ data: { id: 'po', orderNumber: 'PO-CLOSE-TEST', supplierId: 'supplier', status: 'PARTIAL_RECEIVED', totalAmount: 1000,
        items: { create: { id: 'item', productVariantId: 'variant', quantity: 100, receivedQty: 40, unitPrice: 10, subtotal: 1000 } } } });
    await db.goodsReceipt.create({ data: { id: 'gr', receiptNumber: 'GR-OLD', purchaseOrderId: 'po', locationId: 'location', createdAt: new Date('2026-01-01'),
        items: { create: { purchaseOrderItemId: 'item', productVariantId: 'variant', receivedQty: 40, unitCost: 10 } } } });
    await db.purchaseInvoice.create({ data: { id: 'invoice', invoiceNumber: 'BILL-CLOSE-TEST', purchaseOrderId: 'po', invoiceDate: new Date(), totalAmount: 400, status: 'PARTIAL', paidAmount: 100 } });
    await db.inventory.create({ data: { locationId: 'location', productVariantId: 'variant', quantity: 40, averageCost: 10 } });
    await db.account.create({ data: { id: 'account', code: 'TEST', name: 'Synthetic account', type: 'ASSET', category: 'CURRENT_ASSET' } });
    await db.journalEntry.create({ data: { entryNumber: 'JE-CLOSE-TEST', entryDate: new Date(), description: 'Existing invoice journal', referenceId: 'invoice', referenceType: 'PURCHASE_INVOICE', status: 'POSTED', lines: { create: [{ accountId: 'account', debit: 400 }, { accountId: 'account', credit: 400 }] } } });
}
async function snapshot() {
    return JSON.stringify(await Promise.all([
        db.purchaseOrderItem.findMany(), db.goodsReceipt.findMany({ include: { items: true } }),
        db.inventory.findMany(), db.stockMovement.findMany(), db.purchaseInvoice.findMany(),
        db.journalEntry.findMany({ include: { lines: true } }),
    ]));
}
const receiptInput = (qty = 1) => ({ purchaseOrderId: 'po', locationId: 'location', receivedDate: new Date(), isMaklon: false, notes: '',
    items: [{ purchaseOrderItemId: 'item', productVariantId: 'variant', receivedQty: qty }] });

// Wait for a real row-lock waiter instead of relying on sleeps to stage a race.
async function waitForLock() {
    for (let i = 0; i < 100; i++) {
        const [row] = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
        if (Number(row.n) > 0) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Expected a PostgreSQL row-lock waiter');
}

describe.skipIf(!process.env.PO_CLOSE_TEST_DATABASE_URL)('PO closure on isolated PostgreSQL', () => {
    beforeEach(seed);
    afterAll(async () => { await db.$disconnect(); });

    it('changes only status/updatedAt and writes one atomic audit with remaining quantity', async () => {
        const before = await snapshot();
        await closeOrder('po', 'Supplier stops delivery', actor);
        expect(await snapshot()).toBe(before);
        const po = await db.purchaseOrder.findUniqueOrThrow({ where: { id: 'po' } });
        expect(po.status).toBe('CLOSED');
        expect(Number(po.totalAmount)).toBe(1000);
        const logs = await db.auditLog.findMany({ where: { entityId: 'po' } });
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({ userId: actor, details: 'Supplier stops delivery', fromStatus: 'PARTIAL_RECEIVED', toStatus: 'CLOSED' });
        expect(JSON.parse(String(logs[0].changes))).toEqual({ remainingItems: [{ id: 'item', ordered: '100', received: '40', remaining: '60' }] });
        expect(await listReceivablePurchaseOrders()).toEqual([]);
    });
    it('rolls back status and audit on real foreign-key failure', async () => {
        await expect(closeOrder('po', 'reason', 'missing-actor')).rejects.toThrow();
        expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: 'po' } })).status).toBe('PARTIAL_RECEIVED');
        expect(await db.auditLog.count()).toBe(0);
    });
    it('allows only one of concurrent close requests', async () => {
        const outcomes = await Promise.allSettled([closeOrder('po', 'first', actor), closeOrder('po', 'second', actor)]);
        expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(await db.auditLog.count()).toBe(1);
    });
    it('serializes real close and receipt requests without losing or inventing receipt quantity', async () => {
        const outcomes = await Promise.allSettled([createGoodsReceipt(receiptInput(), actor), closeOrder('po', 'reason', actor)]);
        expect(outcomes[1].status).toBe('fulfilled');
        const received = outcomes[0].status === 'fulfilled' ? 41 : 40;
        expect(Number((await db.purchaseOrderItem.findUniqueOrThrow({ where: { id: 'item' } })).receivedQty)).toBe(received);
        expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: 'po' } })).status).toBe('CLOSED');
        const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'CLOSE_PURCHASE_ORDER' } });
        expect(JSON.parse(String(audit.changes)).remainingItems[0].received).toBe(String(received));
        expect(await db.goodsReceipt.count()).toBe(received === 41 ? 2 : 1);
    });
    it('rejects new receipt, legacy close, edit, delete and generic reopen after close', async () => {
        await closeOrder('po', 'reason', actor);
        const before = await snapshot();
        await expect(createGoodsReceipt(receiptInput(), actor)).rejects.toThrow(/ditutup/);
        await expect(createGoodsReceipt({ ...receiptInput(), isMaklon: true }, actor)).rejects.toThrow(/ditutup/);
        await expect(closePurchaseOrderWithDiscrepancy('po', actor)).rejects.toThrow();
        await expect(updateOrderStatus('po', 'SENT', actor)).rejects.toThrow();
        await expect(updateOrder({ id: 'po', items: [] } as never)).rejects.toThrow();
        await expect(deleteOrder('po', actor)).rejects.toThrow();
        expect(await snapshot()).toBe(before);
    });
    it('rejects bypass of required reason via generic CLOSED transition', async () => {
        await expect(updateOrderStatus('po', 'CLOSED', actor)).rejects.toThrow();
        expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: 'po' } })).status).toBe('PARTIAL_RECEIVED');
    });
    it('receipt waiting on close lock rechecks CLOSED before any receipt writes', async () => {
        let outcome!: Promise<PromiseSettledResult<unknown>[]>;
        await db.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = 'po' FOR UPDATE`;
            outcome = Promise.allSettled([createGoodsReceipt(receiptInput(), actor)]);
            await waitForLock();
            await tx.purchaseOrder.update({ where: { id: 'po' }, data: { status: 'CLOSED' } });
        });
        expect((await outcome)[0].status).toBe('rejected');
        expect(await db.goodsReceipt.count()).toBe(1);
    });
    it('close waiting on full receipt commit rejects rather than overwriting RECEIVED', async () => {
        let outcome!: Promise<PromiseSettledResult<unknown>[]>;
        await db.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = 'po' FOR UPDATE`;
            outcome = Promise.allSettled([closeOrder('po', 'reason', actor)]);
            await waitForLock();
            await tx.purchaseOrderItem.update({ where: { id: 'item' }, data: { receivedQty: 100 } });
            await tx.purchaseOrder.update({ where: { id: 'po' }, data: { status: 'RECEIVED' } });
        });
        expect((await outcome)[0].status).toBe('rejected');
        expect(await db.auditLog.count()).toBe(0);
    });
    it('keeps CLOSED after correcting an earlier GR', async () => {
        await closeOrder('po', 'reason', actor);
        await reverseGoodsReceipt('gr', actor, undefined, { syncBill: false });
        expect((await db.purchaseOrder.findUniqueOrThrow({ where: { id: 'po' } })).status).toBe('CLOSED');
        expect(Number((await db.purchaseOrderItem.findUniqueOrThrow({ where: { id: 'item' } })).receivedQty)).toBe(0);
        await expect(createGoodsReceipt(receiptInput(), actor)).rejects.toThrow();
    });
    it('does not resolve a document in a separate empty tenant schema', async () => {
        await db.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS close_empty_tenant');
        await db.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS close_empty_tenant."PurchaseOrder" (id text PRIMARY KEY)');
        const url = new URL(process.env.PO_CLOSE_TEST_DATABASE_URL!);
        url.searchParams.set('schema', 'close_empty_tenant');
        const other = new PrismaClient({ datasources: { db: { url: url.toString() } } });
        try {
            expect(await other.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = 'po' FOR UPDATE`).toEqual([]);
        } finally { await other.$disconnect(); }
    });
    it('additive migration works on populated and empty tenant schemas and is repeatable', async () => {
        const sql = readFileSync('prisma/migrations/20260919_purchase_order_closed/migration.sql', 'utf8');
        for (const schema of ['close_migration_empty', 'close_migration_populated']) {
            await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
            await db.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
            await db.$executeRawUnsafe(`CREATE TYPE ${schema}."PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIAL_RECEIVED', 'RECEIVED', 'CANCELLED')`);
            await db.$executeRawUnsafe(`CREATE TABLE ${schema}."PurchaseOrder" (id text, status ${schema}."PurchaseOrderStatus", quantity numeric, received numeric)`);
            if (schema.endsWith('populated')) await db.$executeRawUnsafe(`INSERT INTO ${schema}."PurchaseOrder" VALUES ('test', 'PARTIAL_RECEIVED', 100, 40)`);
            for (let n = 0; n < 2; n++) await db.$transaction(async tx => {
                await tx.$executeRawUnsafe(`SET LOCAL search_path = ${schema}`);
                await tx.$executeRawUnsafe(sql);
            });
            const rows = await db.$queryRawUnsafe<Array<{ status: string; quantity: Prisma.Decimal; received: Prisma.Decimal }>>(`SELECT * FROM ${schema}."PurchaseOrder"`);
            expect(rows.length).toBe(schema.endsWith('populated') ? 1 : 0);
            if (rows.length) {
                expect(rows[0].status).toBe('PARTIAL_RECEIVED');
                expect(Number(rows[0].received)).toBe(40);
            }
            await db.$executeRawUnsafe(`INSERT INTO ${schema}."PurchaseOrder" VALUES ('closed', 'CLOSED', 100, 40)`);
        }
    });
});
