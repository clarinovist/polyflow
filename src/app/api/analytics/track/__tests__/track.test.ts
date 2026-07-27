import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';

vi.mock('next/server', () => {
    class MockNextResponse {
        status: number;
        _body: unknown;

        constructor(body?: unknown, init?: { status?: number }) {
            this._body = body;
            this.status = init?.status || 200;
        }

        async text() {
            return typeof this._body === 'string' ? this._body : JSON.stringify(this._body);
        }

        async json() {
            return typeof this._body === 'string' ? JSON.parse(this._body) : this._body;
        }

        static json(body: unknown, init?: { status?: number }) {
            return new MockNextResponse(body, init);
        }
    }

    class MockNextRequest {
        url: string;
        method: string;
        _body: string;

        constructor(input: string, init?: { method?: string; body?: string }) {
            this.url = input;
            this.method = init?.method || 'GET';
            this._body = init?.body || '';
        }

        async json() {
            return JSON.parse(this._body);
        }

        get headers() {
            return {
                get: () => null,
            };
        }
    }

    return { NextResponse: MockNextResponse, NextRequest: MockNextRequest };
});

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({
    resolveTenantContext: vi.fn().mockResolvedValue({
        type: 'RESOLVED',
        tenantId: 'tenant-test-123',
        subdomain: 'test',
    }),
}));

vi.mock('@/lib/auth/access-policy', () => ({
    canAccessWorkspace: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        usageEvent: {
            create: vi.fn(),
        },
    },
}));

import { auth } from '@/auth';
import { resolveTenantContext } from '@/lib/core/tenant';
import { canAccessWorkspace } from '@/lib/auth/access-policy';
import { prisma } from '@/lib/core/prisma';
import { NextRequest } from 'next/server';

describe('Analytics Track API Route Hardened', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(resolveTenantContext).mockResolvedValue({
            type: 'RESOLVED',
            tenantId: 'tenant-test-123',
            subdomain: 'test',
            tenantDb: {} as never,
        });
        vi.mocked(canAccessWorkspace).mockReturnValue(true);
    });

    it('returns 401 when user is unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);

        const req = new NextRequest('http://localhost:3000/api/analytics/track', {
            method: 'POST',
            body: JSON.stringify({ pathname: '/sales/orders' }),
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it('returns 403 when tenant context is unresolved or NOT_FOUND', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'user-1' },
        } as never);
        vi.mocked(resolveTenantContext).mockResolvedValue({
            type: 'NOT_FOUND',
            subdomain: 'unknown',
        });

        const req = new NextRequest('http://localhost:3000/api/analytics/track', {
            method: 'POST',
            body: JSON.stringify({ pathname: '/sales/orders' }),
        });

        const res = await POST(req);
        expect(res.status).toBe(403);
    });

    it('returns 400 when pathname is unregistered or invalid', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'user-1' },
        } as never);

        const req = new NextRequest('http://localhost:3000/api/analytics/track', {
            method: 'POST',
            body: JSON.stringify({ pathname: '/unknown-path/foo' }),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    it('returns 403 when user lacks workspace access for the feature module', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'user-1' },
        } as never);
        vi.mocked(canAccessWorkspace).mockReturnValue(false);

        const req = new NextRequest('http://localhost:3000/api/analytics/track', {
            method: 'POST',
            body: JSON.stringify({ pathname: '/sales/orders' }),
        });

        const res = await POST(req);
        expect(res.status).toBe(403);
    });

    it('returns 400 when body is invalid JSON', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'user-1' },
        } as never);

        const req = new NextRequest('http://localhost:3000/api/analytics/track', {
            method: 'POST',
            body: 'invalid-json',
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    it('returns 400 when payload fails Zod schema validation', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'user-1' },
        } as never);

        const req = new NextRequest('http://localhost:3000/api/analytics/track', {
            method: 'POST',
            body: JSON.stringify({ pathname: '' }),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    it('returns deduplicated response on immediate repeat tracking', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'user-dedup' },
        } as never);
        vi.mocked(prisma.usageEvent.create).mockResolvedValue({ id: 'evt-1' } as never);

        const req1 = new NextRequest('http://localhost:3000/api/analytics/track', {
            method: 'POST',
            body: JSON.stringify({
                pathname: '/finance/coa',
                sessionId: 'session-dedup',
            }),
        });

        const res1 = await POST(req1);
        expect(res1.status).toBe(200);

        const req2 = new NextRequest('http://localhost:3000/api/analytics/track', {
            method: 'POST',
            body: JSON.stringify({
                pathname: '/finance/coa',
                sessionId: 'session-dedup',
            }),
        });

        const res2 = await POST(req2);
        expect(res2.status).toBe(200);
        const json2 = await res2.json();
        expect(json2).toEqual({ success: true, deduplicated: true });
    });

    it('returns 429 when user exceeds rate limit of 60 calls/min', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'user-rate-limited' },
        } as never);
        vi.mocked(prisma.usageEvent.create).mockResolvedValue({ id: 'evt-1' } as never);

        let lastRes;
        for (let i = 0; i < 62; i++) {
            const req = new NextRequest('http://localhost:3000/api/analytics/track', {
                method: 'POST',
                body: JSON.stringify({
                    pathname: '/warehouse/inventory',
                    sessionId: `sess-${i}`,
                }),
            });
            lastRes = await POST(req);
        }

        expect(lastRes?.status).toBe(429);
    });

    it('successfully creates UsageEvent derived from valid pathname', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'user-1' },
        } as never);
        vi.mocked(prisma.usageEvent.create).mockResolvedValue({ id: 'evt-1' } as never);

        const req = new NextRequest('http://localhost:3000/api/analytics/track', {
            method: 'POST',
            body: JSON.stringify({
                pathname: '/sales/orders',
                sessionId: 'session-xyz',
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toEqual({ success: true });
        expect(prisma.usageEvent.create).toHaveBeenCalledWith({
            data: {
                tenantId: 'tenant-test-123',
                userId: 'user-1',
                featureKey: 'sales.orders.list',
                moduleKey: 'sales',
                eventType: 'FEATURE_VIEW',
                source: 'WEB',
                sessionId: 'session-xyz',
            },
        });
    });
});
