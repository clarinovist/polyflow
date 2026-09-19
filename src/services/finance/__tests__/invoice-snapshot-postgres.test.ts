import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/core/prisma', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const connection = process.env.SNAPSHOT_TEST_DATABASE_URL;
    if (!connection) return { prisma: undefined, getTenantIdFromContext: () => undefined };
    const url = new URL(connection);
    if (url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/polyflow_snapshot_test') throw new Error('Disposable local snapshot DB required');
    const client = new PrismaClient({ datasources: { db: { url: connection } } });
    return { prisma: client, getTenantDbFromContext: () => client, getTenantIdFromContext: () => undefined };
});
vi.mock('@/services/accounting/account-resolver', () => ({ resolveAccount: vi.fn(async (role: string) => ({ id: role, code: role, name: role })) }));
vi.mock('@/services/accounting/tenant-revenue-rule-service', () => ({ loadActiveTenantRevenueRules: vi.fn().mockResolvedValue([]) }));
vi.mock('@/services/accounting/revenue-account-resolver', () => ({ resolveRevenueAccount: vi.fn().mockResolvedValue(null) }));
vi.mock('@/services/settings/app-settings-service', () => ({ getPaymentBanksSetting: vi.fn().mockResolvedValue([]) }));
import { prisma as db } from '@/lib/core/prisma';
import { createDraftInvoiceFromOrder, createInvoice, updateInvoiceStatus } from '../invoice-lifecycle-service';
import { recordCustomerPaymentInTransaction } from '../customer-payment-service';
import { readInvoiceSnapshot } from '@/lib/finance/invoice-snapshot';
import { getDeliveryRevision, reviseDelivery } from '@/services/sales/delivery-revision-service';
import { syncSalesOrderShippingFromDeliveries } from '@/services/sales/delivery-shipping-sync';
import { AccountingService } from '@/services/accounting/accounting-service';
import { commitDeliveryShipment, createDeliveryOrderFromSalesOrder } from '@/services/sales/delivery-fulfillment-service';
import { changeDeliveryLoad } from '@/services/sales/delivery-load-service';
const actor = 'snapshot-actor';
const date = new Date();
async function seed() {
    expect((await db.$queryRaw<{ db: string }[]>`SELECT current_database() db`)[0].db).toBe('polyflow_snapshot_test');
    await db.$executeRaw`TRUNCATE "AuditLog", "JournalLine", "JournalEntry", "Payment", "Invoice", "StockReservation", "StockMovement", "Inventory", "DeliveryOrder", "SalesOrder", "Customer", "ProductVariant", "Product", "Location", "Account", "FiscalPeriod", "SystemSequence", "User" CASCADE`;
    await db.user.create({ data: { id: actor, email: 'snapshot@example.invalid', password: 'synthetic-test-only', role: 'FINANCE' } });
    await db.customer.create({ data: { id: 'customer', name: 'Original customer' } });
    await db.location.create({ data: { id: 'location', name: 'Test warehouse', slug: 'snapshot' } });
    await db.product.create({ data: { id: 'p', name: 'Original product', productType: 'FINISHED_GOOD' } });
    for (const id of ['a', 'b']) { await db.productVariant.create({ data: { id, productId: 'p', name: `Original ${id}`, skuCode: id, primaryUnit: 'KG' } });
        await db.inventory.create({ data: { productVariantId: id, locationId: 'location', quantity: 200 } }); }
    const accounts = ['accounts-receivable', 'petty-cash', 'sales-revenue', 'sales-rounding-income', 'vat-output'];
    for (const id of accounts) await db.account.create({ data: { id, code: id, name: id,
        type: id === 'vat-output' ? 'LIABILITY' : id.startsWith('sales') ? 'REVENUE' : 'ASSET',
        category: id === 'vat-output' ? 'CURRENT_LIABILITY' : id.startsWith('sales') ? 'OPERATING_REVENUE' : 'CURRENT_ASSET' } });
    await db.fiscalPeriod.createMany({ data: Array.from({ length: 12 }, (_, i) => ({ name: `Test ${i}`, year: date.getFullYear(), month: i + 1, status: 'OPEN' as const, startDate: new Date(date.getFullYear(), i, 1), endDate: new Date(date.getFullYear(), i + 1, 0) })) });
    await db.systemSequence.create({ data: { key: `JOURNAL_ENTRY_${date.getFullYear()}`, value: 100 } });
    await db.salesOrder.create({ data: { id: 'so', orderNumber: 'SO-snapshot', customerId: 'customer', sourceLocationId: 'location', status: 'READY_TO_SHIP', totalAmount: 1100,
        items: { create: { id: 'item', productVariantId: 'a', quantity: 100, deliveredQty: 80, unitPrice: 10, taxPercent: 10, taxAmount: 100, subtotal: 1100 } } } });
    await db.deliveryOrder.create({ data: { id: 'sent', orderNumber: 'DO-sent', salesOrderId: 'so', sourceLocationId: 'location', status: 'IN_TRANSIT', stockCommittedAt: date, totalCharge: 20,
        items: { create: { productVariantId: 'a', quantity: 80 } } } });
}
async function invoice() { return (await createDraftInvoiceFromOrder('so', actor))!; }

describe.skipIf(!process.env.SNAPSHOT_TEST_DATABASE_URL)('durable invoice snapshots on isolated PostgreSQL', () => {
    beforeEach(seed); afterAll(async () => db.$disconnect());
    it('first80 then20 posts exact incremental tax/revenue and keeps original invoice immutable after rename/revision', async () => {
        const first = await invoice(); const snapshot = first.commercialSnapshot;
        expect(readInvoiceSnapshot(snapshot)?.items[0].quantity).toBe(80);
        expect(Number(first.totalAmount)).toBe(1000); expect(Number(first.roundingAmount)).toBe(100);
        await updateInvoiceStatus({ id: first.id, status: 'UNPAID' }, actor);
        await db.productVariant.update({ where: { id: 'a' }, data: { name: 'Renamed later' } });
        await db.customer.update({ where: { id: 'customer' }, data: { name: 'Renamed customer' } });
        await db.salesOrderItem.update({ where: { id: 'item' }, data: { deliveredQty: 100 } });
        await db.deliveryOrder.update({ where: { id: 'sent' }, data: { totalCharge: 50 } });
        const next = await invoice(); const current = readInvoiceSnapshot(next.commercialSnapshot)!;
        expect(current.items[0].quantity).toBe(20); expect(current.taxAmount).toBe('20.00'); expect(current.shippingAmount).toBe('30.00');
        expect((await db.invoice.findUniqueOrThrow({ where: { id: first.id } })).commercialSnapshot).toEqual(snapshot);
        const lines = await db.journalLine.findMany({ where: { journalEntry: { referenceId: next.id, status: 'DRAFT' } } });
        expect(Number(lines.find(l => l.accountId === 'vat-output')?.credit)).toBe(20);
        expect(Number(lines.find(l => l.accountId === 'sales-revenue')?.credit)).toBe(230);
        const same = await invoice(); expect(same.id).toBe(next.id); expect(await db.invoice.count()).toBe(2);
    });
    it('end-to-end second load replacement posts inventory and creates supplemental B invoice with real revenue journal', async () => {
        // Stock GL has separate domain tests; retain real stock writes and real invoice/AR/VAT GL here.
        const stockJournal = vi.spyOn(AccountingService, 'recordInventoryMovement').mockResolvedValue(undefined);
        try {
            const first = await invoice(); await updateInvoiceStatus({ id: first.id, status: 'UNPAID' }, actor);
            const next = await createDeliveryOrderFromSalesOrder({ salesOrderId: 'so', sourceLocationId: 'location', userId: actor });
            const editor = await getDeliveryRevision(next.id);
            await reviseDelivery({ ...editor, reason: 'Physical substitution', remainder: 'CLOSE', items: [{ salesOrderItemId: 'item', quantity: 0 }], additions: [{ productVariantId: 'b', quantity: 20, unitPrice: 15, taxPercent: 10, ppnMode: 'EXCLUDE' }] }, actor);
            const rows = await db.deliveryOrderItem.findMany({ where: { deliveryOrderId: next.id } });
            await changeDeliveryLoad(next.id, actor, { kind: 'verify', items: rows.map(row => ({ id: row.id, verifiedQuantity: Number(row.quantity) })) });
            await changeDeliveryLoad(next.id, actor, { kind: 'lock' });
            await commitDeliveryShipment(next.id, actor);
            const second = await db.invoice.findFirstOrThrow({ where: { salesOrderId: 'so', id: { not: first.id } } });
            expect(readInvoiceSnapshot(second.commercialSnapshot)?.items.map(i => [i.productVariantId, i.quantity])).toEqual([['b', 20]]);
            expect(Number((await db.inventory.findFirstOrThrow({ where: { productVariantId: 'b' } })).quantity)).toBe(180);
            expect(await db.journalEntry.count({ where: { referenceId: second.id, status: 'DRAFT' } })).toBe(1);
            expect(Number((await db.salesOrderItem.findUniqueOrThrow({ where: { id: 'item' } })).quantity)).toBe(80);
        } finally { stockJournal.mockRestore(); }
    });
    it('database rejects issued snapshot replacement/erasure, changed total and reopening but permits payment', async () => {
        const first = await invoice(); await updateInvoiceStatus({ id: first.id, status: 'UNPAID' }, actor);
        await expect(db.$executeRaw`UPDATE "Invoice" SET "commercialSnapshot" = NULL WHERE id = ${first.id}`).rejects.toThrow();
        await expect(db.invoice.update({ where: { id: first.id }, data: { totalAmount: 999 } })).rejects.toThrow();
        await expect(db.invoice.update({ where: { id: first.id }, data: { status: 'DRAFT' } })).rejects.toThrow();
        await expect(db.invoice.delete({ where: { id: first.id } })).rejects.toThrow();
        await db.$transaction(tx => recordCustomerPaymentInTransaction(tx, { invoiceId: first.id, amount: 1000, method: 'Cash', paymentDate: date }, randomUUID(), actor));
        expect((await db.invoice.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('PAID');
    });
    it('rebuilds only draft with exact GL and rolls back on audit/period failure', async () => {
        const first = await invoice();
        await db.salesOrderItem.update({ where: { id: 'item' }, data: { deliveredQty: 90 } });
        await invoice(); expect(readInvoiceSnapshot((await db.invoice.findUniqueOrThrow({ where: { id: first.id } })).commercialSnapshot)?.items[0].quantity).toBe(90);
        const before = await db.invoice.findUniqueOrThrow({ where: { id: first.id } });
        await db.salesOrderItem.update({ where: { id: 'item' }, data: { deliveredQty: 100 } });
        await expect(createDraftInvoiceFromOrder('so', 'missing-actor')).rejects.toThrow();
        expect((await db.invoice.findUniqueOrThrow({ where: { id: first.id } })).commercialSnapshot).toEqual(before.commercialSnapshot);
        await db.fiscalPeriod.updateMany({ data: { status: 'CLOSED' } });
        await expect(invoice()).rejects.toThrow();
        expect(await db.journalEntry.count({ where: { status: 'DRAFT' } })).toBe(1);
    });
    it('concurrent generation creates one draft with one active journal', async () => {
        await Promise.all([invoice(), invoice()]);
        expect(await db.invoice.count()).toBe(1); expect(await db.journalEntry.count({ where: { status: 'DRAFT' } })).toBe(1);
    });
    it('does not allow CLOSE revision below pre-invoiced quantity after partial dispatch', async () => {
        await db.deliveryOrder.deleteMany(); await db.salesOrderItem.update({ where: { id: 'item' }, data: { deliveredQty: 0 } });
        const first = await invoice(); await updateInvoiceStatus({ id: first.id, status: 'UNPAID' }, actor);
        await db.salesOrderItem.update({ where: { id: 'item' }, data: { deliveredQty: 80 } });
        await db.deliveryOrder.create({ data: { id: 'open', orderNumber: 'DO-open', salesOrderId: 'so', sourceLocationId: 'location' } });
        const editor = await getDeliveryRevision('open');
        await expect(reviseDelivery({ ...editor, reason: 'Try reducing billed balance', remainder: 'CLOSE', items: [{ salesOrderItemId: 'item', quantity: 10 }], additions: [] }, actor)).rejects.toThrow(/ditagihkan/);
        expect(Number((await db.salesOrderItem.findUniqueOrThrow({ where: { id: 'item' } })).quantity)).toBe(100);
    });
    it('manual supplementary cannot bill prior allocations twice', async () => {
        const first = await createInvoice({ salesOrderId: 'so', invoiceDate: date, termOfPaymentDays: 30 }, actor);
        await expect(createInvoice({ salesOrderId: 'so', invoiceDate: date, termOfPaymentDays: 30 }, actor)).rejects.toThrow(/Tidak ada nilai/);
        expect(await db.invoice.count()).toBe(1); expect(first.commercialSnapshot).not.toBeNull();
    });
    it('legacy invoice remains null and blocks guessing a supplementary invoice or revised goods', async () => {
        await db.invoice.create({ data: { id: 'legacy', invoiceNumber: 'LEGACY', salesOrderId: 'so', status: 'UNPAID', totalAmount: 500 } });
        await expect(invoice()).rejects.toThrow(/Atribusi/);
        await db.deliveryOrder.create({ data: { id: 'open', orderNumber: 'DO-open', salesOrderId: 'so', sourceLocationId: 'location' } });
        const editor = await getDeliveryRevision('open');
        await expect(reviseDelivery({ ...editor, reason: 'Test replacement', remainder: 'KEEP', items: [{ salesOrderItemId: 'item', quantity: 20 }], additions: [] }, actor)).rejects.toThrow(/Atribusi/);
        expect((await db.invoice.findUniqueOrThrow({ where: { id: 'legacy' } })).commercialSnapshot).toBeNull();
    });
    it('revised replacement goods appear only on supplemental snapshot, first invoice retains A', async () => {
        const first = await invoice(); await updateInvoiceStatus({ id: first.id, status: 'UNPAID' }, actor);
        await db.deliveryOrder.create({ data: { id: 'open', orderNumber: 'DO-open', salesOrderId: 'so', sourceLocationId: 'location' } });
        const editor = await getDeliveryRevision('open');
        await reviseDelivery({ ...editor, reason: 'Replace remaining A with B', remainder: 'CLOSE', items: [{ salesOrderItemId: 'item', quantity: 0 }], additions: [{ productVariantId: 'b', quantity: 20, unitPrice: 15, taxPercent: 10, ppnMode: 'EXCLUDE' }] }, actor);
        const added = await db.salesOrderItem.findFirstOrThrow({ where: { productVariantId: 'b' } });
        await db.salesOrderItem.update({ where: { id: added.id }, data: { deliveredQty: 20 } });
        const next = await invoice();
        expect(readInvoiceSnapshot(next.commercialSnapshot)?.items.map(i => [i.productVariantId, i.quantity])).toEqual([['b', 20]]);
        expect(readInvoiceSnapshot((await db.invoice.findUniqueOrThrow({ where: { id: first.id } })).commercialSnapshot)?.items.map(i => [i.productVariantId, i.quantity])).toEqual([['a', 80]]);
    });
    it('same draft amount but different goods must update snapshot and journal', async () => {
        const first = await invoice();
        await db.salesOrderItem.update({ where: { id: 'item' }, data: { productVariantId: 'b' } });
        await invoice();
        expect(readInvoiceSnapshot((await db.invoice.findUniqueOrThrow({ where: { id: first.id } })).commercialSnapshot)?.items[0].productVariantId).toBe('b');
        expect(await db.journalEntry.count({ where: { status: 'DRAFT' } })).toBe(1);
    });
    it('shipping synchronization updates snapshot and journal together before shipment', async () => {
        await db.deliveryOrder.deleteMany(); await db.salesOrderItem.update({ where: { id: 'item' }, data: { deliveredQty: 0 } });
        const first = await invoice();
        await db.deliveryOrder.create({ data: { orderNumber: 'DO-plan', salesOrderId: 'so', sourceLocationId: 'location', totalCharge: 50 } });
        await syncSalesOrderShippingFromDeliveries('so', { userId: actor });
        expect(readInvoiceSnapshot((await db.invoice.findUniqueOrThrow({ where: { id: first.id } })).commercialSnapshot)?.shippingAmount).toBe('50.00');
    });
    it('migration adds nullable column on empty and populated tenant schemas without backfilling', async () => {
        const sql = readFileSync('prisma/migrations/20260919_invoice_commercial_snapshot/migration.sql', 'utf8');
        for (const schema of ['snapshot_empty', 'snapshot_populated']) {
            await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
            await db.$executeRawUnsafe(`CREATE TABLE ${schema}."Invoice" (id text PRIMARY KEY, status text, "totalAmount" numeric, "roundingAmount" numeric, "salesOrderId" text)`);
            if (schema.endsWith('populated')) await db.$executeRawUnsafe(`INSERT INTO ${schema}."Invoice" VALUES ('old','PAID',123,null,'so')`);
            await db.$transaction(async tx => { await tx.$executeRawUnsafe(`SET LOCAL search_path = ${schema}`);
                // PostgreSQL extended protocol accepts one statement at a time; preserve function body.
                const [alter, rest] = sql.split('\n\n-- An issued');
                await tx.$executeRawUnsafe(alter);
                const functionStart = rest.indexOf('CREATE FUNCTION'); const triggerStart = rest.indexOf('CREATE TRIGGER');
                await tx.$executeRawUnsafe(rest.slice(functionStart, triggerStart)); await tx.$executeRawUnsafe(rest.slice(triggerStart));
            });
            const rows = await db.$queryRawUnsafe<Array<{ commercialSnapshot: unknown; totalAmount: string }>>(`SELECT * FROM ${schema}."Invoice"`);
            expect(rows.length).toBe(schema.endsWith('populated') ? 1 : 0);
            if (rows.length) { expect(rows[0].commercialSnapshot).toBeNull(); expect(Number(rows[0].totalAmount)).toBe(123); }
        }
    });
});
