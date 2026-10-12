import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma, type PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/core/prisma', () => ({ prisma: {}, tenantContext: new AsyncLocalStorage(), tenantIdContext: new AsyncLocalStorage() }));
vi.mock('@/services/finance/invoice-diagnosis-service', () => ({ findInvoices: vi.fn().mockResolvedValue({ kind: 'missing', invoices: [], total: 0, truncated: false }), diagnoseInvoice: vi.fn().mockResolvedValue({ selection: { kind: 'missing', invoices: [], total: 0, truncated: false } }) }));
vi.mock('@/services/finance/finance-reconciliation-service', () => ({ reconcileFinance: vi.fn() }));
vi.mock('@/services/finance/cogs-economic-diagnosis-service', () => ({ diagnoseCogsEconomicCompleteness: vi.fn() }));
vi.mock('@/services/finance/inventory-economic-diagnosis-service', () => ({ diagnoseInventoryEconomicCompleteness: vi.fn() }));
vi.mock('@/services/business-query/engine', () => ({
    executeBusinessQuery: vi.fn(),
}));
import { reconcileFinance } from '@/services/finance/finance-reconciliation-service';
import { diagnoseCogsEconomicCompleteness } from '@/services/finance/cogs-economic-diagnosis-service';
import { diagnoseInventoryEconomicCompleteness } from '@/services/finance/inventory-economic-diagnosis-service';
import { executeBusinessQuery } from '@/services/business-query/engine';
import { tenantContext, tenantIdContext } from '@/lib/core/prisma';
import { getToolByName, getToolsForContext, toolsToOpenAiFormat } from '../tool-registry';
import { getToolLabel } from '../tool-labels';
import type { AssistantUserContext } from '../assistant-types';
const ctx: AssistantUserContext = { userId: 'finance', roles: ['FINANCE'], tenantId: 'one', allowedResources: ['/finance', '/sales/returns', '/warehouse/inventory/history'], channel: 'web', locale: 'id-ID' };
const tx = { $executeRaw: vi.fn() };
const transaction = vi.fn(async fn => fn(tx));
const db = { $transaction: transaction } as unknown as PrismaClient;
const run = (fn: () => unknown, tenantId = 'one') => tenantContext.run(db, () => tenantIdContext.run(tenantId, fn));
beforeEach(() => vi.clearAllMocks());
const newNames = ['get_purchase_invoice', 'diagnose_purchase_invoice', 'diagnose_sales_return_credit'];
const names = ['get_invoice_status', 'diagnose_invoice_payment', 'get_finance_reconciliation', 'diagnose_cogs_economic_completeness', 'diagnose_inventory_economic_completeness', 'query_finance', ...newNames];
const args = (name: string) =>
    name === 'get_finance_reconciliation' || name === 'diagnose_cogs_economic_completeness' || name === 'diagnose_inventory_economic_completeness'
        ? { startDate: '2026-08-01', endDate: '2026-08-31' }
        : name === 'query_finance'
          ? { dataset: 'ledger_expenses', keywords: ['solar', 'ali'] }
          : { searchTerm: 'INV' };

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
    it('requires every cross-domain resource for return and inventory diagnosis', () => {
        for (const resources of [['/finance'], ['/sales/returns']]) {
            expect(getToolsForContext({ ...ctx, allowedResources: resources }).map(t => t.name)).not.toContain('diagnose_sales_return_credit');
        }
        for (const resources of [['/finance'], ['/warehouse/inventory/history']]) {
            expect(getToolsForContext({ ...ctx, allowedResources: resources }).map(t => t.name)).not.toContain('diagnose_inventory_economic_completeness');
        }
        expect(getToolsForContext({ ...ctx, allowedResources: ['/finance', '/warehouse/inventory/history'] }).map(t => t.name)).toContain('diagnose_inventory_economic_completeness');
        for (const name of [...newNames, 'diagnose_inventory_economic_completeness']) expect(getToolLabel(name)).not.toBe('Mengambil data terkait');
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

        vi.mocked(diagnoseCogsEconomicCompleteness).mockResolvedValue({
            range: { startDate: '2026-08-01', endDate: '2026-08-31', start: new Date('2026-08-01Z'), end: new Date('2026-08-31Z') },
            bookkeeping: { reportCogs: 0, journalCogs: 0, difference: 0 },
            coverage: { mandatoryComplete: false, confidenceCap: 0.75, dimensions: [{ code: 'SHIPMENT_HISTORICAL_VALUATION', status: 'partial', reason: 'fallback unknown' }] },
            findings: [{ code: 'SHIPMENT_JOURNAL_MISSING', conditionStatus: 'confirmed', accountingConclusion: 'needs_review', area: 'shipment', amountBasis: 'explicit_movement_cost', count: 1, amount: 100, nominal: 100, revenuePercentage: 10, sourceId: 'movement-1', materiality: 100, reason: 'confirmed', evidenceLimit: 'review', samples: [{ sourceId: 'movement-1', materiality: 100, amount: 100, reason: 'sample' }] }],
            shipments: { count: 1, activeCount: 1, coveredCount: 0, reversedCount: 0, offBalanceCount: 0, quantity: 1, nominalSalesValue: 1000, incompleteSalesValue: 1000, postedCogsValue: 0, explicitMovementValue: { amount: 100, knownCount: 1 }, historicalFallbackUnknownCount: 0 },
            returns: { count: 0, cohortBasis: { physicalReceiptInRange: 0, completedStateUpdatedInRange: 0 }, goodReceiptCount: 0, damagedReceiptCount: 0, physicalRestockValue: 0, activeCommercialCreditValue: 0, originalPostedRevenue: 0, completedWithoutActiveCreditCount: 0, crossPeriodCount: 0 },
            productionFlow: { materialIssue: { count: 0, quantity: 0, movementValue: 0, journalValue: 0 }, wipToOutput: { outputCount: 0, quantity: 0, movementValue: 0, journalValue: 0 }, shipmentCogs: { count: 1, journalValue: 0, attribution: 'aggregate_only' }, returnCost: { count: 0, restockValue: 0 }, sideFlows: { scrapCount: 0, returnInCount: 0, adjustmentCount: 0, maklonOffBalanceCount: 0 }, crossPeriod: { outputWithIssueOutsideRange: 0, issueWithOutputOutsideRange: 0 }, unattributedShipmentCount: 1 },
            limitations: ['No exact lineage'],
        });
        const diagnosis = await run(() => getToolByName('diagnose_cogs_economic_completeness')!.execute(args('diagnose_cogs_economic_completeness'), ctx));
        expect(diagnosis).toMatchObject({ completeness: 'partial', confidenceCap: 0.75, facts: expect.arrayContaining([{ label: expect.stringContaining('CONFIRMED'), value: expect.stringContaining('confirmed') }]) });
        expect(diagnoseCogsEconomicCompleteness).toHaveBeenCalledWith(tx, args('diagnose_cogs_economic_completeness'));

        vi.mocked(diagnoseInventoryEconomicCompleteness).mockResolvedValue({
            range: { startDate: '2026-08-01', endDate: '2026-08-31', start: new Date('2026-08-01Z'), end: new Date('2026-08-31Z') },
            gl: { accountCount: 1, mappedProductCount: 1, unmappedProductCount: 0, openingBalance: 100, periodDebit: 50, periodCredit: 20, closingBalance: 130, rollforwardGap: 0, journalCount: 2, manualJournalCount: 1, orphanJournalCount: 1, closingReferenceCount: 0, scopeBasis: 'persisted_product_inventory_account_mapping' },
            movementCoverage: { count: 1, coveredCount: 0, unvaluedCount: 0, withoutJournalCount: 1, invalidJournalCount: 0, valueMismatchCount: 0, semanticRoleUnknownCount: 0, validReversalCount: 0, invalidReversalCount: 0, crossPeriodReversalCount: 0, quantities: [{ productVariantId: 'variant', unit: 'KG', inbound: 1, outbound: 0, transfer: 0 }] },
            flows: { receipts: 1, shipments: 0, productionIssues: 0, productionOutputs: 0, goodReturns: 0, damagedReturns: 0, purchaseReturns: 0, adjustmentGains: 0, adjustmentLosses: 0, internalTransfers: 0, offBalanceExcluded: 0, materialCostRemainsInWip: 0 },
            coverage: { mandatoryComplete: false, confidenceCap: 0.75, dimensions: [{ code: 'JOURNAL_ATTRIBUTION', status: 'partial', reason: 'orphan journal' }], completenessReasons: ['JOURNAL_ATTRIBUTION: orphan journal'] },
            findings: [{ code: 'INVENTORY_JOURNAL_WITHOUT_MOVEMENT', conditionStatus: 'confirmed', accountingConclusion: 'needs_review', area: 'gl', flow: 'journal', amountBasis: 'posted_inventory_gl', count: 1, amount: 50, nominal: 50, glActivityPercentage: 50, sourceId: 'journal', materiality: 50, reason: 'confirmed', evidenceLimit: 'review', samples: [{ sourceId: 'journal', flow: 'journal', unit: null, amount: 50, materiality: 50, reason: 'sample' }] }],
            limitations: ['No historical stock value'],
        });
        const inventory = await run(() => getToolByName('diagnose_inventory_economic_completeness')!.execute(args('diagnose_inventory_economic_completeness'), { ...ctx, allowedResources: ['/finance', '/warehouse/inventory/history'] }));
        expect(inventory).toMatchObject({ completeness: 'partial', confidenceCap: 0.75, facts: expect.arrayContaining([{ label: expect.stringContaining('CONFIRMED'), value: expect.stringContaining('confirmed') }]) });
        expect(diagnoseInventoryEconomicCompleteness).toHaveBeenCalledWith(tx, args('diagnose_inventory_economic_completeness'));

        vi.mocked(executeBusinessQuery).mockResolvedValue({
            dataset: 'ledger_expenses', keywords: ['solar', 'ali'],
            period: { startDate: '2026-10-01', endDate: '2026-10-12', preset: 'CURRENT_MONTH' },
            basis: 'POSTED expense', totalCount: 0, totalDebit: 0, totalCredit: 0, netAmount: 0, rows: [], truncated: false,
        });
        const search = (await run(() =>
            getToolByName('query_finance')!.execute(
                args('query_finance'),
                ctx,
            ),
        )) as { summary: string };
        expect(search.summary).toContain('Tidak ditemukan');
        expect(executeBusinessQuery).toHaveBeenCalledWith(
            expect.objectContaining({ dataset: 'ledger_expenses', keywords: ['solar', 'ali'] }),
            { db: tx },
        );
    });
    it('has the new progress label and keeps AR/AP summary available', () => {
        expect(getToolLabel('get_finance_reconciliation')).toMatch(/laba|COGS/i);
        expect(getToolLabel('diagnose_cogs_economic_completeness')).toMatch(/ekonomi|COGS/i);
        expect(getToolLabel('diagnose_inventory_economic_completeness')).toMatch(/ekonomi|inventory/i);
        expect(getToolLabel('query_finance')).toMatch(/Buku Besar/i);
        expect(getToolsForContext(ctx).map(t => t.name)).toEqual(expect.arrayContaining(names));
        expect(getToolByName('get_finance_summary')?.description).toBeTruthy();
        const nonFinance = getToolsForContext({ ...ctx, allowedResources: ['/sales'] }).map(t => t.name);
        expect(nonFinance).not.toContain('get_finance_reconciliation');
        expect(nonFinance).not.toContain('diagnose_cogs_economic_completeness');
        expect(nonFinance).not.toContain('diagnose_inventory_economic_completeness');
    });
});

describe('finance input schema', () => {
    it('retains required string dates in OpenAI conversion', () => {
        for (const name of ['get_finance_reconciliation', 'diagnose_cogs_economic_completeness', 'diagnose_inventory_economic_completeness']) {
            const tool = getToolByName(name)!;
            expect(tool).toBeDefined();
            expect(toolsToOpenAiFormat([tool])[0].function.parameters).toMatchObject({ required: ['startDate', 'endDate'], properties: { startDate: { type: 'string', description: expect.stringContaining('WIB') }, endDate: { type: 'string' } } });
        }
    });
    it.each([
        ['2026-02-30', '2026-03-01'], ['2026-08-02', '2026-08-01'], ['2025-01-01', '2026-01-02'],
        ['2026-08-01T00:00:00Z', '2026-08-31'], ['', '2026-08-31'], ['2026-13-01', '2026-13-02'],
    ])('rejects invalid or unbounded dates %s to %s', (startDate, endDate) => {
        for (const name of ['get_finance_reconciliation', 'diagnose_cogs_economic_completeness', 'diagnose_inventory_economic_completeness']) {
            const tool = getToolByName(name)!;
            expect(tool).toBeDefined(); expect(tool.inputSchema.safeParse({ startDate, endDate }).success).toBe(false);
        }
    });
    it('accepts leap day and exactly 366 inclusive days', () => {
        for (const name of ['get_finance_reconciliation', 'diagnose_cogs_economic_completeness', 'diagnose_inventory_economic_completeness']) {
            const schema = getToolByName(name)!.inputSchema;
            expect(schema.safeParse({ startDate: '2024-02-29', endDate: '2025-02-28' }).success).toBe(true);
        }
    });
    it.each(['', '   ', 'a'.repeat(121)])('rejects empty/oversized search input', searchTerm => {
        expect(getToolByName('get_invoice_status')!.inputSchema.safeParse({ searchTerm }).success).toBe(false);
    });
    it('exposes bounded finance query schema without tenant or SQL fields', () => {
        const tool = getToolByName('query_finance')!;
        expect(tool.inputSchema.safeParse({ dataset: 'ledger_expenses', keywords: ['solar'] }).success).toBe(true);
        expect(tool.inputSchema.safeParse({ dataset: 'ledger_expenses', keywords: ['solar'], sql: 'select 1' }).success).toBe(false);
        expect(tool.inputSchema.safeParse({ dataset: 'ledger_expenses', keywords: ['solar'], tenantId: 'other' }).success).toBe(false);
    });
});
