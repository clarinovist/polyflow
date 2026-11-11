import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    moduleGuard: vi.fn(),
    recap: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/tenant', () => ({
    withTenantRoute: (handler: unknown) => handler,
}));
vi.mock('@/lib/modules/guard', () => ({
    requireModuleOrNextResponse: mocks.moduleGuard,
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: {} }));
vi.mock('@/services/hrd/bpjs-recap-service', () => ({
    BpjsRecapService: { getRecap: mocks.recap },
}));

import { GET } from '../route';

function request(query = ''): NextRequest {
    return {
        nextUrl: new URL(`http://acme.localhost/api/hrd/bpjs/export${query}`),
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
    mocks.recap.mockResolvedValue({ rows: [] });
});

describe('bpjs export access', () => {
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
        expect(mocks.recap).not.toHaveBeenCalled();
    });

    it.each(['SALES', 'PRODUCTION', 'WAREHOUSE', 'EMPLOYEE'])(
        'returns 403 for role %s without reading data',
        async (role) => {
            mocks.auth.mockResolvedValue(sessionFor(role));
            const res = await call();
            expect(res.status).toBe(403);
            expect(mocks.recap).not.toHaveBeenCalled();
        },
    );

    it.each(['ADMIN', 'FINANCE', 'HRD'])('allows role %s', async (role) => {
        mocks.auth.mockResolvedValue(sessionFor(role));
        const res = await call('');
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/csv');
    });

    it('returns 400 for an invalid month after passing the role check', async () => {
        mocks.auth.mockResolvedValue(sessionFor('HRD'));
        expect((await call('?year=2026&month=13')).status).toBe(400);
    });
});
