import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma, type PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/core/prisma', () => ({ prisma: {}, tenantContext: new AsyncLocalStorage(), tenantIdContext: new AsyncLocalStorage() }));
vi.mock('@/services/finance/invoice-diagnosis-service', () => ({ findInvoices: vi.fn().mockResolvedValue({ kind: 'missing', invoices: [], total: 0, truncated: false }), diagnoseInvoice: vi.fn().mockResolvedValue({ selection: { kind: 'missing', invoices: [], total: 0, truncated: false } }) }));
vi.mock('@/services/finance/finance-reconciliation-service', () => ({ reconcileFinance: vi.fn() }));
import { reconcileFinance } from '@/services/finance/finance-reconciliation-service';
import { tenantContext, tenantIdContext } from '@/lib/core/prisma';
import { getToolByName, getToolsForContext, toolsToOpenAiFormat } from '../tool-registry';
import { getToolLabel } from '../tool-labels';
import type { AssistantUserContext } from '../assistant-types';
const ctx: AssistantUserContext = { userId: 'finance', roles: ['FINANCE'], tenantId: 'one', allowedResources: ['/finance'], channel: 'web', locale: 'id-ID' };
const tx = { $executeRaw: vi.fn() };
const transaction = vi.fn(async fn => fn(tx));
const db = { $transaction: transaction } as unknown as PrismaClient;
const run = (fn: () => unknown, tenantId = 'one') => tenantContext.run(db, () => tenantIdContext.run(tenantId, fn));
beforeEach(() => vi.clearAllMocks());
const names = ['get_invoice_status', 'diagnose_invoice_payment', 'get_finance_reconciliation'];
const args = (name: string) => name === 'get_finance_reconciliation' ? { startDate: '2026-08-01', endDate: '2026-08-31' } : { searchTerm: 'INV' };

describe('finance execution boundary', () => {
    it.each(names)('%s rejects missing or mismatched live tenant and unauthorized callers before querying', async name => {
        const tool = getToolByName(name)!;
        expect(tool).toBeDefined();
        await expect(tool.execute(args(name), ctx)).rejects.toThrow(/tenant/i);
        await expect(run(() => tool.execute(args(name), ctx), 'two')).rejects.toThrow(/tenant/i);
        await expect(run(() => tool.execute(args(name), { ...ctx, allowedResources: [] }))).rejects.toThrow(/akses/i);
        await expect(run(() => tool.execute(args(name), undefined as unknown as AssistantUserContext))).rejects.toThrow(/akses/i);
        expect(transaction).not.toHaveBeenCalled();
    });
    it.each(names)('%s rejects model-supplied tenant and SQL keys', async name => {
        const tool = getToolByName(name)!;
        expect(tool).toBeDefined();
        for (const extra of [{ tenantId: 'two' }, { sql: 'SELECT 1' }]) {
            await expect(run(() => tool.execute({ ...args(name), ...extra }, ctx))).rejects.toThrow();
        }
        expect(transaction).not.toHaveBeenCalled();
    });
    it('uses a read-only repeatable-read transaction from live ALS', async () => {
        await run(() => getToolByName('get_invoice_status')!.execute({ searchTerm: 'INV' }, ctx));
        expect(transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }));
        expect(tx.$executeRaw.mock.calls[0][0].join('')).toContain('SET TRANSACTION READ ONLY');
    });
    it('keeps interleaved executions bound to each live ALS database and id', async () => {
        const secondTx = { $executeRaw: vi.fn() };
        const secondTransaction = vi.fn(async fn => fn(secondTx));
        const secondDb = { $transaction: secondTransaction } as unknown as PrismaClient;
        const first = tenantContext.run(db, () => tenantIdContext.run('one', async () => {
            await Promise.resolve();
            return getToolByName('get_invoice_status')!.execute({ searchTerm: 'first' }, ctx);
        }));
        const second = tenantContext.run(secondDb, () => tenantIdContext.run('two', async () => {
            await Promise.resolve();
            return getToolByName('get_invoice_status')!.execute({ searchTerm: 'second' }, { ...ctx, tenantId: 'two' });
        }));
        await Promise.all([first, second]);
        expect(transaction).toHaveBeenCalledTimes(1); expect(secondTransaction).toHaveBeenCalledTimes(1);
        expect(tx.$executeRaw).toHaveBeenCalledTimes(1); expect(secondTx.$executeRaw).toHaveBeenCalledTimes(1);
        expect(tenantContext.getStore()).toBeUndefined(); expect(tenantIdContext.getStore()).toBeUndefined();
    });
    it('sanitizes transaction failures before they enter model evidence', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            transaction.mockRejectedValueOnce(new Error('postgres://private-host/internal-query'));
            await expect(run(() => getToolByName('get_invoice_status')!.execute({ searchTerm: 'INV' }, ctx))).rejects.toThrow('Pemeriksaan finance gagal');
            expect(log).toHaveBeenCalledWith('[finance-tool] read-only query failed', { tool: 'get_invoice_status', errorType: 'UNEXPECTED' });
        } finally { log.mockRestore(); }
    });
    it('executes diagnosis and reconciliation definitions and returns their evidence', async () => {
        const report = { revenue: [], cogs: [], opex: [], other: [], totalRevenue: 1000, totalManufacturingCosts: 300, inventoryChange: 0, totalCOGS: 300, grossProfit: 700, totalOpEx: 50, operatingIncome: 650, totalOther: -10, netIncome: 640 };
        vi.mocked(reconcileFinance).mockResolvedValue({ range: { startDate: '2026-08-01', endDate: '2026-08-31', start: new Date('2026-08-01Z'), end: new Date('2026-08-31Z') }, report,
            cogs: { rows: [], count: 0, total: 0, truncated: false }, invoices: { rows: [], count: 0, total: 0, truncated: false }, cogsDifference: 0 });
        expect(await run(() => getToolByName('diagnose_invoice_payment')!.execute({ searchTerm: 'INV' }, ctx))).toMatchObject({ summary: 'Invoice tidak ditemukan.' });
        const result = await run(() => getToolByName('get_finance_reconciliation')!.execute(args('get_finance_reconciliation'), ctx));
        expect(result).toMatchObject({ facts: expect.arrayContaining([{ label: 'Laba bersih', value: expect.stringContaining('640,00') }]) });
        expect(reconcileFinance).toHaveBeenCalledWith(tx, args('get_finance_reconciliation'));
    });
    it('has the new progress label and keeps AR/AP summary available', () => {
        expect(getToolLabel('get_finance_reconciliation')).toMatch(/laba|COGS/i);
        expect(getToolsForContext(ctx).map(t => t.name)).toEqual(expect.arrayContaining(names));
        expect(getToolByName('get_finance_summary')?.description).toBeTruthy();
        expect(getToolsForContext({ ...ctx, allowedResources: ['/sales'] }).map(t => t.name)).not.toContain('get_finance_reconciliation');
    });
});

describe('finance input schema', () => {
    it('retains required string dates in OpenAI conversion', () => {
        const tool = getToolByName('get_finance_reconciliation')!;
        expect(tool).toBeDefined();
        expect(toolsToOpenAiFormat([tool])[0].function.parameters).toMatchObject({ required: ['startDate', 'endDate'], properties: { startDate: { type: 'string', description: expect.stringContaining('WIB') }, endDate: { type: 'string' } } });
    });
    it.each([
        ['2026-02-30', '2026-03-01'], ['2026-08-02', '2026-08-01'], ['2025-01-01', '2026-01-02'],
        ['2026-08-01T00:00:00Z', '2026-08-31'], ['', '2026-08-31'], ['2026-13-01', '2026-13-02'],
    ])('rejects invalid or unbounded dates %s to %s', (startDate, endDate) => {
        const tool = getToolByName('get_finance_reconciliation')!;
        expect(tool).toBeDefined(); expect(tool.inputSchema.safeParse({ startDate, endDate }).success).toBe(false);
    });
    it('accepts leap day and exactly 366 inclusive days', () => {
        const schema = getToolByName('get_finance_reconciliation')!.inputSchema;
        expect(schema.safeParse({ startDate: '2024-02-29', endDate: '2025-02-28' }).success).toBe(true);
    });
    it.each(['', '   ', 'a'.repeat(121)])('rejects empty/oversized search input', searchTerm => {
        expect(getToolByName('get_invoice_status')!.inputSchema.safeParse({ searchTerm }).success).toBe(false);
    });
});
