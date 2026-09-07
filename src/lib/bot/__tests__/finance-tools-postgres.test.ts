import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const { AsyncLocalStorage } = await import('node:async_hooks');
    const connection = process.env.TEST_DATABASE_URL;
    const tenantContext = new AsyncLocalStorage();
    const tenantIdContext = new AsyncLocalStorage();
    if (!connection) return { prisma: undefined, tenantContext, tenantIdContext };
    const url = new URL(connection);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/polyflow_recognition_test') {
        throw new Error('Only disposable localhost polyflow_recognition_test is allowed');
    }
    return { prisma: new PrismaClient({ datasources: { db: { url: connection } } }), tenantContext, tenantIdContext };
});
import { prisma as db, tenantContext, tenantIdContext } from '@/lib/core/prisma';
import { getToolByName } from '../tool-registry';
import { reconcileFinance } from '@/services/finance/finance-reconciliation-service';
import { Prisma } from '@prisma/client';
import { evidenceToText } from '../evidence';
import type { AssistantUserContext } from '../assistant-types';

const ctx: AssistantUserContext = {
    userId: 'test-finance', roles: ['FINANCE'], allowedResources: ['/finance'],
    tenantId: 'test-tenant', channel: 'web', locale: 'id-ID',
};
const execute = (name: string, args: unknown) => tenantContext.run(db, () =>
    tenantIdContext.run(ctx.tenantId, () => getToolByName(name)!.execute(args, ctx)));

const period = { startDate: '2026-08-01', endDate: '2026-08-31' };
async function seedLedger() {
    await db.account.createMany({ data: [
        { id: 'ar', code: '11210', name: 'AR', type: 'ASSET', category: 'CURRENT_ASSET' },
        { id: 'revenue', code: 'CUSTOM-R', name: 'Revenue', type: 'REVENUE', category: 'OPERATING_REVENUE' },
        { id: 'cogs', code: 'CUSTOM-C', name: 'COGS', type: 'EXPENSE', category: 'COGS' },
        { id: 'opex', code: 'CUSTOM-O', name: 'OpEx', type: 'EXPENSE', category: 'OPERATING_EXPENSE' },
        { id: 'other', code: 'CUSTOM-X', name: 'Other', type: 'REVENUE', category: 'OTHER_REVENUE' },
    ] });
    await db.fiscalPeriod.create({ data: { name: 'August', year: 2026, month: 8, startDate: new Date('2026-08-01Z'), endDate: new Date('2026-08-31Z'), status: 'CLOSED' } });
}
async function entry(id: string, accountId: string, net: number, overrides: Partial<Prisma.JournalEntryCreateInput> = {}) {
    return db.journalEntry.create({ data: {
        id, entryNumber: id, entryDate: new Date('2026-08-15Z'), description: 'Synthetic fixture', reference: id, status: 'POSTED',
        lines: { create: [{ accountId, debit: Math.max(0, net), credit: Math.max(0, -net) }, { accountId: 'ar', debit: Math.max(0, -net), credit: Math.max(0, net) }] },
        ...overrides,
    } });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)('finance tools on disposable PostgreSQL', () => {
    beforeEach(async () => {
        expect((await db.$queryRaw<{ db: string }[]>`SELECT current_database() db`)[0].db).toBe('polyflow_recognition_test');
        await db.$executeRaw`TRUNCATE "JournalLine", "JournalEntry", "Payment", "Invoice", "SalesOrder", "Customer", "Account", "FiscalPeriod" CASCADE`;
        await db.customer.create({ data: { id: 'customer', name: 'Fixture Customer' } });
        await db.salesOrder.create({ data: { id: 'order', orderNumber: 'SO-FINANCE', customerId: 'customer', totalAmount: 100 } });
        await db.invoice.create({ data: { id: 'invoice', invoiceNumber: 'INV-FINANCE', salesOrderId: 'order', totalAmount: 100, invoiceDate: new Date('2026-08-15T00:00:00Z') } });
    });
    afterAll(async () => { await db.$disconnect(); });

    it('reconciles category-based P&L and sources including negative COGS at exact WIB boundaries', async () => {
        await seedLedger();
        await entry('REV', 'revenue', -1000);
        await entry('COGS-START', 'cogs', 300, { entryDate: new Date('2026-07-31T17:00:00Z') });
        await entry('COGS-END', 'cogs', -40, { entryDate: new Date('2026-08-31T16:59:59.999Z') });
        await entry('OPEX', 'opex', 50); await entry('OTHER', 'other', -10);
        await entry('BEFORE', 'cogs', 2000, { entryDate: new Date('2026-07-31T16:59:59.999Z') });
        await entry('AFTER', 'cogs', 2000, { entryDate: new Date('2026-08-31T17:00:00Z') });
        await entry('DRAFT', 'cogs', 2000, { status: 'DRAFT' });
        await entry('VOIDED', 'cogs', 2000, { status: 'VOIDED' });
        await entry('CLOSING', 'cogs', 2000, { reference: 'CLOSING-AUG' });
        await entry('NULL', 'cogs', 2000, { reference: null });
        const result = await db.$transaction(tx => reconcileFinance(tx, period));
        expect(result.report).toMatchObject({ totalRevenue: 1000, totalCOGS: 260, grossProfit: 740, totalOpEx: 50, totalOther: 10, netIncome: 700 });
        expect(result.cogs.total).toBe(260); expect(result.cogsDifference).toBe(0);
        expect(result.cogs.rows.map(r => r.id)).toEqual(['COGS-START', 'COGS-END']);
        const toolResult = await execute('get_finance_reconciliation', period);
        expect(evidenceToText(toolResult)).toContain('700,00');
        expect(toolResult.entities?.map(e => e.id)).toContain('COGS-END');
        expect(evidenceToText(toolResult)).toContain('BUKAN tambahan laba');
    });

    it('preserves aggregate totals when source samples are truncated and labels invoice cohort separately', async () => {
        await seedLedger();
        for (let n = 0; n < 22; n++) {
            await entry(`COGS-${n}`, 'cogs', 10);
            await db.invoice.create({ data: { id: `i${n}`, invoiceNumber: `INV-${n}`, salesOrderId: 'order', totalAmount: 100, invoiceDate: new Date('2026-08-15Z'), status: 'PAID', paidAmount: 100 } });
        }
        await db.invoice.update({ where: { id: 'invoice' }, data: { status: 'DRAFT' } });
        const result = await db.$transaction(tx => reconcileFinance(tx, period));
        expect(result.cogs).toMatchObject({ total: 220, count: 22, truncated: true });
        expect(result.cogs.rows).toHaveLength(20);
        expect(result.invoices).toMatchObject({ total: 2200, count: 22, truncated: true });
        expect(result.invoices.rows).toHaveLength(20);
        expect((await execute('get_finance_reconciliation', period)).completeness).toBe('partial');
    });

    it('diagnoses paid vs Payment mismatch and unposted revenue without writing business data', async () => {
        await seedLedger();
        await db.invoice.update({ where: { id: 'invoice' }, data: { status: 'PAID', paidAmount: 100 } });
        await db.payment.create({ data: { id: 'payment', paymentNumber: 'PAY-FINANCE', paymentDate: new Date('2026-08-20Z'), amount: 80, method: 'Cash', invoiceId: 'invoice' } });
        await entry('SALE', 'revenue', -100, { status: 'DRAFT', referenceType: 'SALES_INVOICE', referenceId: 'invoice' });
        const before = await db.invoice.findUnique({ where: { id: 'invoice' } });
        const result = await execute('diagnose_invoice_payment', { searchTerm: 'INV-FINANCE' });
        const text = evidenceToText(result);
        expect(text).toContain('PAYMENT_TOTAL_MISMATCH'); expect(text).toContain('JOURNAL_NOT_POSTED:SALE');
        expect(text).toContain('PAYMENT_JOURNAL_MISSING:payment'); expect(text).toContain('CLOSED');
        expect(await db.invoice.findUnique({ where: { id: 'invoice' } })).toEqual(before);
        expect(await db.payment.count()).toBe(1); expect(await db.journalEntry.count()).toBe(1);
    });

    it('requires clarification for partial collisions but prefers exact id/number and escapes wildcards', async () => {
        await db.invoice.create({ data: { id: 'another', invoiceNumber: 'INV-FINANCE-2', salesOrderId: 'order', totalAmount: 50 } });
        const ambiguous = await execute('diagnose_invoice_payment', { searchTerm: 'Fixture Customer' });
        expect(ambiguous.summary).toContain('2 invoice'); expect(ambiguous.summary).toContain('ambigu');
        expect(ambiguous.entities).toHaveLength(2);
        expect((await execute('get_invoice_status', { searchTerm: 'INV-FINANCE' })).entities).toHaveLength(1);
        expect((await execute('get_invoice_status', { searchTerm: 'invoice' })).entities?.[0].id).toBe('invoice');
        expect((await execute('get_invoice_status', { searchTerm: '%' })).summary).toContain('tidak ditemukan');
    });

    it.each(['INV%LITERAL', 'INV_LITERAL', 'INV\\LITERAL'])('exact-matches literal wildcard/backslash invoice number %s', async invoiceNumber => {
        await db.invoice.create({ data: { id: 'literal', invoiceNumber, salesOrderId: 'order', totalAmount: 50 } });
        const result = await execute('get_invoice_status', { searchTerm: invoiceNumber });
        expect(result.entities?.map(e => e.id)).toEqual(['literal']);
        expect(result.completeness).toBe('complete');
    });

    it('screens duplicate and unrecognized posted invoices, excludes voided journals and keeps empty ranges empty', async () => {
        await seedLedger();
        await entry('DUP-1', 'revenue', -100, { referenceType: 'SALES_INVOICE', referenceId: 'invoice' });
        await entry('DUP-2', 'revenue', -100, { referenceType: 'SALES_INVOICE', referenceId: 'invoice' });
        await entry('VOID', 'revenue', -100, { referenceType: 'SALES_INVOICE', referenceId: 'invoice', status: 'VOIDED' });
        const duplicate = await db.$transaction(tx => reconcileFinance(tx, period));
        expect(duplicate.invoices.rows[0]).toMatchObject({ activeJournals: BigInt(2), postedJournals: BigInt(2) });
        await db.invoice.update({ where: { id: 'invoice' }, data: { status: 'DRAFT' } });
        const draftPosted = await db.$transaction(tx => reconcileFinance(tx, period));
        expect(draftPosted.invoices.count).toBe(1);
        const empty = await execute('get_finance_reconciliation', { startDate: '2025-01-01', endDate: '2025-01-31' });
        expect(empty.entities).toEqual([]);
        expect(empty.facts.find(f => f.label === 'Laba bersih')?.value).toContain('0,00');
    });

    it('rejects unauthorized and mismatched live tenants even with a real database bound', async () => {
        const tool = getToolByName('get_finance_reconciliation')!;
        await expect(tenantContext.run(db, () => tenantIdContext.run('other-tenant', () => tool.execute(period, ctx)))).rejects.toThrow(/tenant/i);
        await expect(tenantContext.run(db, () => tenantIdContext.run(ctx.tenantId, () => tool.execute(period, { ...ctx, allowedResources: ['/sales'] })))).rejects.toThrow(/akses/i);
        expect(await db.invoice.count()).toBe(1);
    });

    it('executes through real READ ONLY REPEATABLE READ and PostgreSQL refuses a write', async () => {
        const original = db.$transaction.bind(db);
        const spy = vi.spyOn(db, '$transaction').mockImplementationOnce((async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => original(async tx => {
            const result = await fn(tx);
            const settings = await tx.$queryRaw<{ ro: string; isolation: string }[]>`SELECT current_setting('transaction_read_only') ro, current_setting('transaction_isolation') isolation`;
            expect(settings[0]).toEqual({ ro: 'on', isolation: 'repeatable read' });
            await tx.$executeRaw`SAVEPOINT write_probe`;
            await expect(tx.$executeRaw`UPDATE "Invoice" SET "paidAmount" = 999 WHERE id = 'invoice'`).rejects.toThrow(/read-only/);
            await tx.$executeRaw`ROLLBACK TO SAVEPOINT write_probe`;
            return result;
        }, options)) as typeof db.$transaction);
        try { await execute('get_invoice_status', { searchTerm: 'INV-FINANCE' }); }
        finally { spy.mockRestore(); }
        expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: 'invoice' } })).paidAmount)).toBe(0);
    });

    it.each(['get_invoice_status', 'diagnose_invoice_payment'])('%s resolves customer through SalesOrder', async name => {
        const result = await execute(name, { searchTerm: 'INV-FINANCE' });
        expect(evidenceToText(result)).toContain('Fixture Customer');
        expect(result.entities).toContainEqual(expect.objectContaining({ type: 'Invoice', id: 'invoice' }));
    });
});
