import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { resetReturnFixture, returnTestClient } from '@/services/finance/__tests__/return-credit-postgres-fixture';

vi.mock('@/lib/core/prisma', async () => {
    const { AsyncLocalStorage } = await import('node:async_hooks');
    const { returnTestClient } = await import('@/services/finance/__tests__/return-credit-postgres-fixture');
    const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
    const db = connection ? returnTestClient(connection) : undefined;
    return { prisma: db, tenantContext: new AsyncLocalStorage(), tenantIdContext: new AsyncLocalStorage() };
});
import { prisma as db, tenantContext, tenantIdContext } from '@/lib/core/prisma';
import { getToolByName } from '../tool-registry';
import { documentNumberPredicate } from '../document-search';
import { verifyAssistantSessionUser } from '../assistant-session';
import { buildAssistantContext } from '../assistant-context';
import { getAvailableAssistantTools } from '../assistant-tool-access';
import type { AssistantUserContext } from '../assistant-types';

const ctx: AssistantUserContext = { userId: 'synthetic-user', roles: ['ADMIN'], allowedResources: 'ALL', tenantId: 'synthetic-tenant', channel: 'web', locale: 'id-ID' };
const execute = (tool: string, searchTerm: string) => tenantContext.run(db, () =>
    tenantIdContext.run(ctx.tenantId, () => getToolByName(tool)!.execute({ searchTerm }, ctx)));

// This suite runs in the existing serialized disposable PostgreSQL CI gate.
describe.skipIf(!process.env.RETURN_CREDIT_TEST_DATABASE_URL)('document lookup PostgreSQL contracts', () => {
    beforeAll(async () => {
        await resetReturnFixture(db);
        await db.supplier.create({ data: { id: 'doc-supplier', name: 'Synthetic - Supplier' } });
        await db.purchaseOrder.create({ data: { id: 'doc-po', orderNumber: 'PO-2026-0421', supplierId: 'doc-supplier', status: 'RECEIVED', totalAmount: 100 } });
        await db.purchaseOrder.create({ data: { id: 'doc-po-old', orderNumber: 'PO-2025-0421', supplierId: 'doc-supplier', totalAmount: 100 } });
        await db.goodsReceipt.create({ data: { id: 'doc-gr', receiptNumber: 'GR-2026-0421', purchaseOrderId: 'doc-po', locationId: 'location', items: { create: { productVariantId: 'variant', receivedQty: 2, unitCost: 50 } } } });
        await db.purchaseInvoice.create({ data: { id: 'doc-bill', invoiceNumber: 'BILL-2026-0422', purchaseOrderId: 'doc-po', totalAmount: 100 } });
        await db.salesOrder.update({ where: { id: 'order' }, data: { orderNumber: 'SO-2026-0421' } });
        await db.invoice.update({ where: { id: 'invoice' }, data: { invoiceNumber: 'INV-2026-0421' } });
        await db.deliveryOrder.create({ data: { id: 'doc-do', orderNumber: 'DO-2026-0421', salesOrderId: 'order', sourceLocationId: 'location' } });
    });
    afterAll(async () => { await db?.$disconnect(); });

    it.each(['get_purchase_order', 'diagnose_po_invoice_mismatch'])('%s resolves normalized PO and retains evidence on found/missing', async tool => {
        for (const search of ['PO PO-2026-0421', 'PO‑2026‑0421', 'PO - 2026 - 0421']) {
            const result = await execute(tool, search);
            expect(result.entities?.filter(e => e.type === 'PurchaseOrder').map(e => e.id)).toEqual(['doc-po']);
            expect(result.searchMeta).toMatchObject({ searchTerm: search, matchCount: 1, matchCountScope: 'returned' });
        }
        const missing = await execute(tool, 'PO-2024-0421');
        expect(missing.searchMeta?.matchCount).toBe(0);
        expect(missing.summary).toContain('tidak ditemukan');
        expect(missing.completeness).toBe('partial');
    });
    it('uses real receipt fields and item value, never nonexistent status/total columns', async () => {
        const result = await execute('diagnose_po_invoice_mismatch', 'PO PO-2026-0421');
        expect(result.facts.find(f => f.label === 'Receipt: GR-2026-0421')?.value).toContain('nilai item Rp');
        expect(result.facts.find(f => f.label === 'Invoice: BILL-2026-0422')?.value).toBe('UNPAID');
        const noReceipt = await execute('diagnose_po_invoice_mismatch', 'PO-2025-0421');
        expect(noReceipt.facts).toContainEqual({ label: 'Goods Receipt', value: 'Belum ada penerimaan barang' });
    });
    it.each(['get_sales_order_lines', 'diagnose_so_fulfillment', 'get_delivery_status'])('%s resolves the normalized SO and misses unrelated years', async tool => {
        const result = await execute(tool, 'SO SO‑2026‑0421');
        expect(result.searchMeta?.matchCount).toBe(1);
        expect(result.entities?.length).toBeGreaterThan(0);
        expect((await execute(tool, 'SO-2024-0421')).searchMeta?.matchCount).toBe(0);
    });
    it('resolves delivery by its own number as well as linked SO', async () => {
        expect((await execute('get_delivery_status', 'DO - 2026 - 0421')).entities?.[0].id).toBe('doc-do');
    });
    it('keeps supplier and customer lookup literal without logging their names', async () => {
        expect((await execute('get_purchase_order', 'Synthetic - Supplier')).searchMeta).toMatchObject({ searchTerm: null, candidates: [], matchCount: 2 });
        expect((await execute('get_sales_order_lines', 'Synthetic Customer')).searchMeta).toMatchObject({ searchTerm: null, candidates: [], matchCount: 1 });
        for (const tool of ['get_purchase_order', 'get_sales_order_lines', 'get_delivery_status', 'diagnose_po_invoice_mismatch']) {
            expect((await execute(tool, "%_\\' OR 1=1")).searchMeta?.matchCount).toBe(0);
        }
    });
    it.each(['get_invoice_status', 'diagnose_invoice_payment'])('%s preserves exact normalized invoice resolution', async tool => {
        const result = await execute(tool, 'INV INV‑2026‑0421');
        expect(result.entities?.find(e => e.type === 'Invoice')?.id).toBe('invoice');
        expect(result.searchMeta).toMatchObject({ matchCount: 1, matchCountScope: 'total' });
        expect((await execute(tool, 'INV-2024-0421')).searchMeta?.matchCount).toBe(0);
        expect((await execute(tool, 'Synthetic Customer')).searchMeta?.searchTerm).toBeNull();
    });
    it.each(['BILL - 2026 -0422', 'BILL‑2026‑0422'])('matches BILL predicate %s on PurchaseInvoice (tool arrives in phase B)', async raw => {
        const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "PurchaseInvoice" WHERE (${documentNumberPredicate(Prisma.sql`"invoiceNumber"`, raw)})`);
        expect(rows.map(r => r.id)).toEqual(['doc-bill']);
    });
    it('offers PO tools to a live tenant ADMIN without permission rows and removes them when revoked', async () => {
        const id = 'doc-admin';
        await db.user.create({ data: { id, email: 'doc-admin@example.invalid', password: 'synthetic-not-a-login', role: 'ADMIN' } });
        // No RolePermission row is needed for the existing ADMIN role policy.
        const session = { id, role: 'ADMIN', allowedResources: ['ALL'] };
        const verified = await verifyAssistantSessionUser(session);
        expect(verified).toMatchObject({ allowedResources: 'ALL', isSuperAdmin: false });
        const context = buildAssistantContext(verified!, ctx.tenantId);
        const tools = getAvailableAssistantTools(context, true);
        const poTool = tools.find(tool => tool.name === 'get_purchase_order');
        expect(poTool).toBeDefined();
        expect((await poTool!.execute({ searchTerm: 'PO PO-2026-0421' }, context)).searchMeta?.matchCount).toBe(1);
        await db.user.update({ where: { id }, data: { role: 'WAREHOUSE' } });
        const revoked = await verifyAssistantSessionUser(session);
        expect(revoked?.allowedResources).not.toBe('ALL');
        expect(getAvailableAssistantTools(buildAssistantContext(revoked!, ctx.tenantId), true).some(tool => tool.name === 'get_purchase_order')).toBe(false);
        await db.userRole.create({ data: { userId: id, role: 'ADMIN' } });
        expect((await verifyAssistantSessionUser(session))?.allowedResources).toBe('ALL');
        await db.user.update({ where: { id }, data: { isActive: false } });
        expect(await verifyAssistantSessionUser(session)).toBeNull();
    });
    it('keeps read-only finance tenant and permission guards intact', async () => {
        const tool = getToolByName('get_invoice_status')!;
        await expect(tenantContext.run(db, () => tenantIdContext.run('foreign', () => tool.execute({ searchTerm: 'INV‑2026‑0421' }, ctx)))).rejects.toThrow(/tenant/i);
        await expect(tool.execute({ searchTerm: 'INV‑2026‑0421' }, { ...ctx, allowedResources: [] })).rejects.toThrow(/akses/i);
        expect(await db.purchaseInvoice.count({ where: { id: 'doc-bill' } })).toBe(1);
        expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).paidAmount)).toBe(0);
    });
});

it('refuses to construct a contract client for production or an unmarked database URL', () => {
    expect(() => returnTestClient('postgresql://test:fixture@remote.invalid:55439/polyflow_return_credit_scope_test')).toThrow(/isolated/);
});
