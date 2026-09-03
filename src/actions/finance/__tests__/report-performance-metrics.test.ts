import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/core/prisma';

/**
 * Guards the Finance report instrumentation added 2026-09-03.
 *
 * Before this, no Finance route wrote a PerformanceMetric sample at all, so a
 * "is the report slow?" question had no data to answer it. These tests assert
 * each report action still emits exactly one sample under its own route key —
 * a silent regression here would put us back to guessing.
 */

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: unknown) => fn,
}));

vi.mock('@/lib/auth/finance-access', () => ({
    requireFinanceAccess: vi.fn().mockResolvedValue({ id: 'u1' }),
    requireFinanceMutation: vi.fn().mockResolvedValue({ id: 'u1' }),
    requireFinanceApprover: vi.fn().mockResolvedValue({ id: 'u1' }),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        performanceMetric: { create: vi.fn().mockResolvedValue({}) },
    },
}));

vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn() },
}));

vi.mock('@/services/accounting/accounting-service', () => ({
    AccountingService: {
        getTrialBalance: vi.fn().mockResolvedValue([]),
        getIncomeStatement: vi.fn().mockResolvedValue({ netIncome: 0 }),
        getBalanceSheet: vi.fn().mockResolvedValue({ totalAssets: 0 }),
        getGeneralLedgerSummary: vi.fn().mockResolvedValue({
            accounts: [],
            grandTotalDebit: 0,
            grandTotalCredit: 0,
        }),
    },
}));

vi.mock('@/services/finance/fixed-asset-service', () => ({
    FixedAssetService: {},
}));
vi.mock('@/services/finance/budget-service', () => ({ BudgetService: {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

function lastRoute(): string {
    const calls = vi.mocked(prisma.performanceMetric.create).mock.calls;
    const call = calls[calls.length - 1][0] as { data: { route: string } };
    return call.data.route;
}

describe('finance report performance instrumentation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.performanceMetric.create).mockResolvedValue(
            {} as never,
        );
    });

    it('getTrialBalance records a trial-balance sample', async () => {
        const { getTrialBalance } = await import('../accounting');

        await getTrialBalance(
            new Date('2026-08-01'),
            new Date('2026-08-31'),
        );

        expect(prisma.performanceMetric.create).toHaveBeenCalledTimes(1);
        expect(lastRoute()).toBe('trial-balance');
    });

    it('getIncomeStatement records an income-statement sample', async () => {
        const { getIncomeStatement } = await import('../accounting');

        await getIncomeStatement(
            new Date('2026-08-01'),
            new Date('2026-08-31'),
        );

        expect(prisma.performanceMetric.create).toHaveBeenCalledTimes(1);
        expect(lastRoute()).toBe('income-statement');
    });

    it('getBalanceSheet records a balance-sheet sample', async () => {
        const { getBalanceSheet } = await import('../accounting');

        await getBalanceSheet(new Date('2026-08-31'));

        expect(prisma.performanceMetric.create).toHaveBeenCalledTimes(1);
        expect(lastRoute()).toBe('balance-sheet');
    });

    it('getGeneralLedgerSummary records a general-ledger-summary sample', async () => {
        const { getGeneralLedgerSummary } = await import('../accounting');

        await getGeneralLedgerSummary(
            new Date('2026-08-01'),
            new Date('2026-08-31'),
        );

        expect(prisma.performanceMetric.create).toHaveBeenCalledTimes(1);
        expect(lastRoute()).toBe('general-ledger-summary');
    });

    it('still returns report data when the metric write fails', async () => {
        vi.mocked(prisma.performanceMetric.create).mockRejectedValueOnce(
            new Error('db unreachable'),
        );
        const { getBalanceSheet } = await import('../accounting');

        const result = await getBalanceSheet(new Date('2026-08-31'));

        expect(result).toEqual(
            expect.objectContaining({ success: true }),
        );
    });
});
