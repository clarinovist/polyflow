import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
    mockPrisma: { auditLog: { findMany: vi.fn() } },
}));

vi.mock('@/lib/core/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/errors/errors', () => ({
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            return { success: true as const, data: await fn() };
        } catch (e) {
            return {
                success: false as const,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    },
    AuthorizationError: class AuthorizationError extends Error {},
}));

import { requireAuth } from '@/lib/tools/auth-checks';
import { getEntityStatusTimeline } from '../entity-timeline';

const asMock = (fn: unknown) => vi.mocked(fn as (...args: never[]) => unknown);

const sessionFor = (role: string, roles: string[] = [role]) => ({
    user: { id: 'u-1', role, roles },
});

const log = {
    id: 'log-1',
    action: 'CLOSE_PURCHASE_ORDER',
    fromStatus: 'ORDERED',
    toStatus: 'CLOSED',
    details: 'Ditutup, selisih harga disepakati',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    user: { name: 'Budi' },
};

async function timelineFor(entityType: string) {
    const result = await getEntityStatusTimeline(entityType, 'e-1');
    return (
        result as unknown as {
            data: { details: string | null; toStatus: string | null }[];
        }
    ).data;
}

describe('getEntityStatusTimeline: price-sensitive details', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.auditLog.findMany.mockResolvedValue([log]);
    });

    it('drops free-text details of a PurchaseOrder for read-only FACTORY_MANAGER', async () => {
        asMock(requireAuth).mockResolvedValue(sessionFor('FACTORY_MANAGER'));

        const [entry] = await timelineFor('PurchaseOrder');

        expect(entry.details).toBeNull();
        expect(entry.toStatus).toBe('CLOSED');
    });

    it.each(['PurchaseInvoice', 'ProductVariant', 'ProductionOrder'])(
        'drops details of %s for read-only FACTORY_MANAGER (entity type is client-controlled)',
        async (entityType) => {
            asMock(requireAuth).mockResolvedValue(sessionFor('FACTORY_MANAGER'));

            const [entry] = await timelineFor(entityType);

            expect(entry.details).toBeNull();
            expect(entry.toStatus).toBe('CLOSED');
        },
    );

    it.each([
        ['PROCUREMENT', ['PROCUREMENT']],
        ['FACTORY_MANAGER', ['FACTORY_MANAGER', 'ADMIN']],
    ])('keeps PurchaseOrder details for %s %j', async (role, roles) => {
        asMock(requireAuth).mockResolvedValue(sessionFor(role, roles));

        const [entry] = await timelineFor('PurchaseOrder');

        expect(entry.details).toBe(log.details);
    });
});
