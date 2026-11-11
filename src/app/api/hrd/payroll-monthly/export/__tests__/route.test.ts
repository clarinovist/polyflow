import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    moduleGuard: vi.fn(),
    findPeriod: vi.fn(),
    listPayslips: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/tenant', () => ({
    withTenantRoute: (handler: unknown) => handler,
}));
vi.mock('@/lib/modules/guard', () => ({
    requireModuleOrNextResponse: mocks.moduleGuard,
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        payrollPeriod: {
            findUnique: mocks.findPeriod,
            findFirst: mocks.findPeriod,
        },
    },
}));
vi.mock('@/services/hrd/payroll-monthly-service', () => ({
    PayrollMonthlyService: { listPayslips: mocks.listPayslips },
}));

import { GET } from '../route';

function request(query = ''): NextRequest {
    return {
        nextUrl: new URL(`http://acme.localhost/api/hrd/payroll-monthly/export${query}`),
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
    mocks.findPeriod.mockResolvedValue({ id: 'p1', year: 2026, month: 1 });
    mocks.listPayslips.mockResolvedValue([]);
});

describe('payroll-monthly export access', () => {
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
        expect(mocks.listPayslips).not.toHaveBeenCalled();
    });

    it.each(['SALES', 'PRODUCTION', 'WAREHOUSE', 'EMPLOYEE'])(
        'returns 403 for role %s without reading data',
        async (role) => {
            mocks.auth.mockResolvedValue(sessionFor(role));
            const res = await call();
            expect(res.status).toBe(403);
            expect(mocks.listPayslips).not.toHaveBeenCalled();
        },
    );

    it.each(['ADMIN', 'FINANCE', 'HRD'])('allows role %s', async (role) => {
        mocks.auth.mockResolvedValue(sessionFor(role));
        const res = await call('?periodId=p1');
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/csv');
    });
});

describe('payroll-monthly export header', () => {
    it('labels the attendance deduction column without the old "Prorata" name', async () => {
        mocks.auth.mockResolvedValue(sessionFor('HRD'));
        const res = await call('?periodId=p1');
        const header = (await res.text()).replace(/^\uFEFF/, '').split(/\r?\n/)[0];
        const columns = header.split(',');

        expect(columns).not.toContain('Prorata');
        expect(columns[columns.indexOf('Kasbon') + 1]).toBe('PotonganAbsensi');
        expect(columns).toHaveLength(15);
    });
});
