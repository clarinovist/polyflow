import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
    class MockNextResponse {
        _body: unknown;
        status: number;
        constructor(body?: unknown, init?: { status?: number }) {
            this._body = body;
            this.status = init?.status ?? 200;
        }
        async json() {
            return this._body;
        }
        static json(body: unknown, init?: { status?: number }) {
            return new MockNextResponse(body, init);
        }
    }
    return { NextResponse: MockNextResponse };
});

vi.mock('@/lib/core/tenant', () => ({
    withTenantRoute: (handler: (req: Request) => unknown) => handler,
}));

vi.mock('@/lib/tools/api-auth', () => ({
    requireApiRoles: vi.fn(async () => ({ response: null, userId: 'user-1' })),
}));

const mockPrisma = vi.hoisted(() => ({
    bom: { findMany: vi.fn() },
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: mockPrisma,
}));

import { GET } from '../route';

function makeBom(overrides: Record<string, unknown>) {
    return {
        id: `bom-${Math.random().toString(36).slice(2, 6)}`,
        name: 'BOM',
        outputQuantity: 1,
        isDefault: false,
        productVariantId: 'variant-out',
        productVariant: { skuCode: 'SKU', name: 'Variant', product: { name: 'Product' } },
        items: [],
        ...overrides,
    };
}

describe('GET /api/boms', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns boms as-is without continuesFromVariantId', async () => {
        mockPrisma.bom.findMany.mockResolvedValueOnce([
            makeBom({ name: 'A', items: [{ productVariantId: 'wip-1' }] }),
            makeBom({ name: 'B', items: [{ productVariantId: 'wip-2' }] }),
        ]);

        const res = (await GET(new Request('http://localhost/api/boms') as never)) as { json: () => Promise<Array<{ name: string; isChainMatch?: boolean }>> };
        const body = await res.json();

        expect(body).toHaveLength(2);
        expect(body[0].isChainMatch).toBeUndefined();
    });

    it('sorts BOMs whose items match continuesFromVariantId to the top with isChainMatch=true', async () => {
        mockPrisma.bom.findMany.mockResolvedValueOnce([
            makeBom({ name: 'Unrelated', items: [{ productVariantId: 'other-wip' }] }),
            makeBom({ name: 'Matches Chain', items: [{ productVariantId: 'wip-prev-output' }] }),
        ]);

        const res = (await GET(
            new Request('http://localhost/api/boms?continuesFromVariantId=wip-prev-output') as never,
        )) as { json: () => Promise<Array<{ name: string; isChainMatch?: boolean; items?: unknown }>> };
        const body = await res.json();

        expect(body[0]).toMatchObject({ name: 'Matches Chain', isChainMatch: true });
        expect(body[1]).toMatchObject({ name: 'Unrelated', isChainMatch: false });
        expect(body[0].items).toBeUndefined();
    });

    it('does not filter out non-matching BOMs — chain-aware sort is informational only', async () => {
        mockPrisma.bom.findMany.mockResolvedValueOnce([
            makeBom({ name: 'No match at all', items: [{ productVariantId: 'unrelated' }] }),
        ]);

        const res = (await GET(
            new Request('http://localhost/api/boms?continuesFromVariantId=wip-prev-output') as never,
        )) as { json: () => Promise<Array<{ name: string; isChainMatch?: boolean }>> };
        const body = await res.json();

        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({ name: 'No match at all', isChainMatch: false });
    });
});
