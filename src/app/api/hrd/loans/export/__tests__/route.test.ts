import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    moduleGuard: vi.fn(),
    list: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/tenant', () => ({
    withTenantRoute: (handler: unknown) => handler,
}));
vi.mock('@/lib/modules/guard', () => ({
    requireModuleOrNextResponse: mocks.moduleGuard,
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: {} }));
vi.mock('@/services/hrd/payroll-monthly-service', () => ({
    EmployeeLoanService: { list: mocks.list },
}));

import { GET } from '../route';

function request(query = ''): NextRequest {
    return {
        nextUrl: new URL(`http://acme.localhost/api/hrd/loans/export${query}`),
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
    mocks.list.mockResolvedValue([]);
});

describe('loans export access', () => {
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
        expect(mocks.list).not.toHaveBeenCalled();
    });

    it.each(['SALES', 'PRODUCTION', 'WAREHOUSE', 'EMPLOYEE'])(
        'returns 403 for role %s without reading data',
        async (role) => {
            mocks.auth.mockResolvedValue(sessionFor(role));
            const res = await call();
            expect(res.status).toBe(403);
            expect(mocks.list).not.toHaveBeenCalled();
        },
    );

    it.each(['ADMIN', 'FINANCE', 'HRD'])('allows role %s', async (role) => {
        mocks.auth.mockResolvedValue(sessionFor(role));
        const res = await call('');
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/csv');
    });

    it('neutralises formula text in the reason column', async () => {
        mocks.auth.mockResolvedValue(sessionFor('FINANCE'));
        mocks.list.mockResolvedValue([
            {
                loanNumber: 'KB-1',
                employee: { code: 'E1', name: 'Acme Worker' },
                date: new Date('2026-01-02T00:00:00Z'),
                principalAmount: 1000,
                remainingBalance: 500,
                repaymentType: 'INSTALLMENT',
                installmentAmount: null,
                status: 'ACTIVE',
                reason: '=HYPERLINK("x")',
            },
        ]);
        const body = await (await call()).text();
        expect(body).toContain('"\'=HYPERLINK(""x"")"');
    });
});
