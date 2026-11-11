import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    moduleGuard: vi.fn(),
    weekly: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/tenant', () => ({
    withTenantRoute: (handler: unknown) => handler,
}));
vi.mock('@/lib/modules/guard', () => ({
    requireModuleOrNextResponse: mocks.moduleGuard,
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: {} }));
vi.mock('@/services/hrd/payroll-service', () => ({
    PayrollService: { getWeeklyPayrollForAll: mocks.weekly },
}));

import { GET } from '../route';

function request(query = ''): NextRequest {
    return {
        nextUrl: new URL(`http://acme.localhost/api/hrd/payroll/export${query}`),
    } as unknown as NextRequest;
}

function sessionFor(role: string) {
    return { user: { id: 'u1', role, roles: [role] } };
}

const call = (query = '') =>
    (GET as unknown as (req: NextRequest) => Promise<Response>)(request(query));

beforeEach(() => {
    vi.resetAllMocks();
    mocks.moduleGuard.mockResolvedValue(null);
    mocks.weekly.mockResolvedValue([]);
});

describe('payroll export access', () => {
    it('returns the module denial before checking the session', async () => {
        mocks.moduleGuard.mockResolvedValue(new Response('no module', { status: 403 }));
        const res = await call();
        expect(res.status).toBe(403);
        expect(mocks.auth).not.toHaveBeenCalled();
    });

    it('returns 401 without a session', async () => {
        mocks.auth.mockResolvedValue(null);
        const res = await call();
        expect(res.status).toBe(401);
        expect(mocks.weekly).not.toHaveBeenCalled();
    });

    it.each(['SALES', 'PRODUCTION', 'WAREHOUSE', 'EMPLOYEE'])(
        'returns 403 for role %s without reading data',
        async (role) => {
            mocks.auth.mockResolvedValue(sessionFor(role));
            const res = await call();
            expect(res.status).toBe(403);
            expect(mocks.weekly).not.toHaveBeenCalled();
        },
    );

    it.each(['ADMIN', 'FINANCE', 'HRD'])('allows role %s', async (role) => {
        mocks.auth.mockResolvedValue(sessionFor(role));
        const res = await call('');
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/csv');
    });

    it('keeps negative numbers numeric and neutralises formula names', async () => {
        mocks.auth.mockResolvedValue(sessionFor('HRD'));
        mocks.weekly.mockResolvedValue([
            {
                employeeCode: 'E1',
                employeeName: '=cmd|calc',
                payType: 'DAILY',
                daysWorked: 5,
                totalActualHours: 40,
                totalKgPaid: 0,
                totalKgUnpaid: 0,
                totalDailyEarnings: 100,
                totalOvertimeEarnings: 0,
                totalPieceEarnings: 0,
                totalEarnings: 100,
                bpjsDeduction: 150,
                netPay: -50,
                isBpjsWeek: true,
            },
        ]);
        const body = await (await call('?date=2026-01-07')).text();
        const row = body.split('\n')[1];
        expect(row).toContain("'=cmd|calc");
        expect(row).toContain(',-50,');
    });
});

describe('payroll export default week (WIB)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mocks.auth.mockResolvedValue(sessionFor('HRD'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it.each([
        ['Monday 05:00 WIB (Sunday 22:00Z)', '2026-07-13', '2026-07-12T22:00:00.000Z'],
        ['Monday 08:00 WIB', '2026-07-13', '2026-07-13T01:00:00.000Z'],
        ['Sunday 23:30 WIB', '2026-07-13', '2026-07-19T16:30:00.000Z'],
    ])('without date at %s starts the week on %s', async (_label, expected, now) => {
        vi.setSystemTime(new Date(now));

        const res = await call();

        const weekStart = mocks.weekly.mock.calls[0][1] as Date;
        expect(weekStart.toISOString().slice(0, 10)).toBe(expected);
        expect(res.headers.get('Content-Disposition')).toContain(`gaji-${expected}.csv`);
    });

    it('explicit date is unchanged', async () => {
        vi.setSystemTime(new Date('2026-07-12T22:00:00.000Z'));

        await call('?date=2026-07-01');

        const weekStart = mocks.weekly.mock.calls[0][1] as Date;
        expect(weekStart.toISOString().slice(0, 10)).toBe('2026-06-29');
    });
});
