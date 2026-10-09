import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    guard: vi.fn(),
    entitled: vi.fn(),
    access: vi.fn(),
    profit: vi.fn(),
    cash: vi.fn(),
    attention: vi.fn(),
    periodSignals: vi.fn(),
    drivers: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/errors/errors', () => ({
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            return { success: true as const, data: await fn() };
        } catch (error) {
            return {
                success: false as const,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
}));
vi.mock('@/lib/auth/finance-access', () => ({
    requireFinanceAccess: mocks.guard,
}));
vi.mock('@/lib/auth/access-policy', () => ({
    hasWorkspaceEntitlement: mocks.entitled,
}));
vi.mock('@/services/finance/finance-dashboard-service', async (original) => ({
    ...(await original<object>()),
    resolveFreshFinanceDashboardAccess: mocks.access,
    readFinanceProfitHealth: mocks.profit,
    readFinanceCashHealth: mocks.cash,
    readFinanceAttention: mocks.attention,
    readFinancePeriodSignals: mocks.periodSignals,
    readFinanceDrivers: mocks.drivers,
}));

import { getFinanceShiftBoard } from '../finance-dashboard';

const attention = {
    state: 'AVAILABLE' as const,
    arOverdue: {
        total: 7,
        amount: 450,
        returned: 1,
        items: [],
    },
    arUnpaid: { total: 12, amount: 900 },
    apOverdue: {
        total: 8,
        amount: 600,
        returned: 1,
        items: [],
    },
    apUnpaid: { total: 15, amount: 1_200 },
    draftJournals: { total: 6, returned: 1, items: [] },
    openBankRecs: 2,
};

function setup() {
    mocks.guard.mockResolvedValue({ user: { id: 'finance-user' } });
    mocks.entitled.mockReturnValue(true);
    mocks.access.mockResolvedValue({ resources: 'ALL' });
    mocks.profit.mockResolvedValue({
        revenue: 1_000,
        grossProfit: 600,
        netProfit: 250,
    });
    mocks.cash.mockResolvedValue({ configured: true, value: 0 });
    mocks.attention.mockResolvedValue(attention);
    mocks.periodSignals.mockResolvedValue({
        openCount: 2,
        currentPeriod: null,
        daysToMonthEnd: null,
        reconThisMonth: 1,
    });
    mocks.drivers.mockResolvedValue({
        revenue: Array.from({ length: 4 }, (_, index) => ({
            month: `2026-0${index + 1}`,
            value: (index + 1) * 100,
        })),
        netIncome: Array.from({ length: 4 }, (_, index) => ({
            month: `2026-0${index + 1}`,
            value: (index + 1) * 40,
        })),
    });
}

describe('getFinanceShiftBoard R4B', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-15T10:00:00.000Z'));
        setup();
    });

    it('returns four canonical Health metrics, Attention, and two Drivers', async () => {
        const result = await getFinanceShiftBoard({
            startDate: new Date('2026-04-01T00:00:00+07:00'),
            endDate: new Date('2026-04-30T00:00:00+07:00'),
        });

        expect(result.success).toBe(true);
        if (!result.success || !result.data || result.data.state !== 'AVAILABLE')
            return;
        expect(result.data.health).toEqual({
            cash: { state: 'AVAILABLE', value: 0 },
            revenue: { state: 'AVAILABLE', value: 1_000 },
            grossProfit: { state: 'AVAILABLE', value: 600 },
            netProfit: { state: 'AVAILABLE', value: 250 },
        });
        expect(result.data.attention?.arOverdue?.total).toBe(7);
        expect(result.data.drivers.state).toBe('AVAILABLE');
        expect(result.data.drivers.revenue).toHaveLength(4);
        expect(result.data.drivers.netIncome).toHaveLength(4);
    });

    it('enforces authorization and entitlement before every nominal reader', async () => {
        mocks.access.mockRejectedValueOnce(
            new Error('Unauthorized: root grant revoked'),
        );

        const denied = await getFinanceShiftBoard();

        expect(denied).toMatchObject({
            success: false,
            error: 'Unauthorized: root grant revoked',
        });
        expect(mocks.profit).not.toHaveBeenCalled();
        expect(mocks.cash).not.toHaveBeenCalled();
        expect(mocks.attention).not.toHaveBeenCalled();

        vi.clearAllMocks();
        setup();
        mocks.entitled.mockReturnValue(false);
        const hidden = await getFinanceShiftBoard();
        expect(hidden.success && hidden.data?.state).toBe('HIDDEN');
        expect(mocks.access).not.toHaveBeenCalled();
        expect(mocks.profit).not.toHaveBeenCalled();
    });

    it('fails stale session roles closed before dashboard queries', async () => {
        mocks.guard.mockResolvedValue({
            user: { id: 'stale-user', role: 'FINANCE' },
        });
        mocks.access.mockRejectedValue(
            new Error('Unauthorized: fresh DB role is SALES'),
        );

        const result = await getFinanceShiftBoard();

        expect(result.success).toBe(false);
        expect(mocks.access).toHaveBeenCalledWith('stale-user');
        expect(mocks.profit).not.toHaveBeenCalled();
    });

    it('keeps successful sections useful when individual readers fail', async () => {
        mocks.cash.mockRejectedValue(new Error('balance unavailable'));
        mocks.attention.mockRejectedValue(new Error('queue unavailable'));

        const result = await getFinanceShiftBoard();

        expect(result.success).toBe(true);
        if (!result.success || !result.data || result.data.state !== 'AVAILABLE')
            return;
        expect(result.data.health.cash).toEqual({
            state: 'UNAVAILABLE',
            value: null,
        });
        expect(result.data.health.revenue.value).toBe(1_000);
        expect(result.data.attention).toBeNull();
        expect(result.data.periodSignals?.openCount).toBe(2);
        expect(result.data.drivers.state).toBe('AVAILABLE');
    });

    it('distinguishes missing cash mapping from a valid zero', async () => {
        mocks.cash.mockResolvedValue({ configured: false, value: null });
        const missing = await getFinanceShiftBoard();
        expect(
            missing.success && missing.data?.state === 'AVAILABLE'
                ? missing.data.health?.cash
                : null,
        ).toEqual({ state: 'NOT_CONFIGURED', value: null });

        mocks.cash.mockResolvedValue({ configured: true, value: 0 });
        const zero = await getFinanceShiftBoard();
        expect(
            zero.success && zero.data?.state === 'AVAILABLE'
                ? zero.data.health?.cash
                : null,
        ).toEqual({ state: 'AVAILABLE', value: 0 });
    });

    it('withholds Drivers until four aligned comparable points exist', async () => {
        mocks.drivers.mockResolvedValue({
            revenue: [{ month: '2026-01', value: 1 }],
            netIncome: [{ month: '2026-01', value: 2 }],
        });

        const result = await getFinanceShiftBoard();

        expect(result.success).toBe(true);
        if (!result.success || !result.data || result.data.state !== 'AVAILABLE')
            return;
        expect(result.data.drivers).toEqual({
            state: 'NOT_CONFIGURED',
            revenue: [],
            netIncome: [],
        });

        mocks.drivers.mockResolvedValue({
            revenue: Array.from({ length: 4 }, (_, index) => ({
                month: `2026-0${index + 1}`,
                value: index,
            })),
            netIncome: Array.from({ length: 4 }, (_, index) => ({
                month: `2025-0${index + 1}`,
                value: index,
            })),
        });
        const misaligned = await getFinanceShiftBoard();
        expect(
            misaligned.success && misaligned.data?.state === 'AVAILABLE'
                ? misaligned.data.drivers?.state
                : null,
        ).toBe('NOT_CONFIGURED');
    });

    it('derives drill-down links from the freshly authorized root grant', async () => {
        mocks.access.mockResolvedValue({ resources: ['/finance'] });

        const result = await getFinanceShiftBoard();

        expect(result.success).toBe(true);
        if (!result.success || !result.data || result.data.state !== 'AVAILABLE')
            return;
        expect(result.data.permissions?.links.journals).toBe(
            '/finance/journals',
        );
        expect(result.data.permissions?.links.balanceSheet).toBe(
            '/finance/reports/balance-sheet',
        );
        expect(result.data.permissions?.links.returns).toBe('/finance/returns');
    });
});
