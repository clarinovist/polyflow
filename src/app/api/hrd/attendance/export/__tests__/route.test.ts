import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    moduleGuard: vi.fn(),
    daily: vi.fn(),
    weekly: vi.fn(),
    monthly: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/tenant', () => ({
    withTenantRoute: (handler: unknown) => handler,
}));
vi.mock('@/lib/modules/guard', () => ({
    requireModuleOrNextResponse: mocks.moduleGuard,
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: {} }));
vi.mock('@/services/hrd/attendance-service', () => ({
    AttendanceService: {
        listByDate: mocks.daily,
        getWeeklySummary: mocks.weekly,
        getMonthlySummary: mocks.monthly,
    },
}));

import { GET } from '../route';

function request(query = ''): NextRequest {
    return {
        nextUrl: new URL(`http://acme.localhost/api/hrd/attendance/export${query}`),
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
    mocks.daily.mockResolvedValue([]);
    mocks.weekly.mockResolvedValue([]);
    mocks.monthly.mockResolvedValue([]);
});

describe('attendance export access', () => {
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
        expect(mocks.daily).not.toHaveBeenCalled();
    });

    it.each(['SALES', 'PRODUCTION', 'WAREHOUSE', 'EMPLOYEE'])(
        'returns 403 for role %s without reading data',
        async (role) => {
            mocks.auth.mockResolvedValue(sessionFor(role));
            const res = await call();
            expect(res.status).toBe(403);
            expect(mocks.daily).not.toHaveBeenCalled();
        },
    );

    it.each(['ADMIN', 'FINANCE', 'HRD'])('allows role %s', async (role) => {
        mocks.auth.mockResolvedValue(sessionFor(role));
        const res = await call('?date=2026-01-07');
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/csv');
    });

    it.each([
        '?date=2026-01-07%22%0d%0aX-Evil:1',
        '?date=../../etc',
        '?date=2026-13-45',
        '?date=2026-02-30',
        '?mode=weekly&date=abc',
        '?mode=monthly&year=2026abc&month=1',
        '?mode=monthly&year=2026&month=13',
        '?mode=monthly&year=1&month=1',
        '?mode=monthly&year=2026&month=0',
        '?mode=monthly&date=2026-01-07&month=1%22x',
    ])('returns 400 for invalid parameters %s', async (query) => {
        mocks.auth.mockResolvedValue(sessionFor('HRD'));
        const res = await call(query);
        expect(res.status).toBe(400);
        expect(mocks.daily).not.toHaveBeenCalled();
        expect(mocks.weekly).not.toHaveBeenCalled();
        expect(mocks.monthly).not.toHaveBeenCalled();
    });

    it('builds the filename only from validated values', async () => {
        mocks.auth.mockResolvedValue(sessionFor('HRD'));
        const daily = await call('?date=2026-01-07');
        expect(daily.headers.get('Content-Disposition')).toBe(
            'attachment; filename="absensi-harian-2026-01-07.csv"',
        );
        const monthly = await call('?mode=monthly&year=2026&month=3');
        expect(monthly.headers.get('Content-Disposition')).toBe(
            'attachment; filename="absensi-bulanan-2026-03.csv"',
        );
        const weekly = await call('?mode=weekly&date=2026-01-07');
        expect(weekly.headers.get('Content-Disposition')).toBe(
            'attachment; filename="absensi-mingguan-2026-01-05.csv"',
        );
    });

    it('defaults to today when no date is supplied', async () => {
        mocks.auth.mockResolvedValue(sessionFor('HRD'));
        expect((await call('')).status).toBe(200);
    });
});
