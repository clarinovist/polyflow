import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getActiveOrderNav } from '../active-order-nav';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: { findMany: vi.fn() },
    },
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

function buildOrder(overrides: Record<string, unknown> = {}) {
    return {
        id: 'order-1',
        orderNumber: 'WO-260903-001',
        status: 'IN_PROGRESS',
        plannedQuantity: 100,
        actualQuantity: 25,
        bom: {
            productVariant: {
                name: 'Varian A',
                product: { name: 'Sedotan Bening' },
            },
        },
        ...overrides,
    };
}

describe('getActiveOrderNav', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockResolvedValue({
            user: { id: 'user-1' },
        } as never);
    });

    it('queries only active statuses, ordered like the daily board', async () => {
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue(
            [] as never,
        );

        await getActiveOrderNav();

        const args = vi.mocked(prisma.productionOrder.findMany).mock
            .calls[0][0] as {
            where: { status: { in: string[] } };
            orderBy: { createdAt: string };
        };

        expect(args.where.status.in).toEqual([
            'RELEASED',
            'IN_PROGRESS',
            'WAITING_MATERIAL',
        ]);
        // COMPLETED/CANCELLED would reintroduce the ~490-row fetch this action
        // exists to avoid.
        expect(args.where.status.in).not.toContain('COMPLETED');
        expect(args.where.status.in).not.toContain('CANCELLED');
        // Must match getDailyBoardData so the strip and board agree on order.
        expect(args.orderBy.createdAt).toBe('desc');
    });

    it('computes progress percent from planned vs actual', async () => {
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
            buildOrder(),
        ] as never);

        const result = await getActiveOrderNav();

        if (!result.success) throw new Error('expected success');
        expect(result.data[0].progressPercent).toBe(25);
        expect(result.data[0].productName).toBe('Sedotan Bening');
    });

    it('caps progress at 100 percent when actual exceeds planned', async () => {
        // Over-production is real; an uncapped value would blow out the strip
        // layout with a >100% bar.
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
            buildOrder({ plannedQuantity: 100, actualQuantity: 250 }),
        ] as never);

        const result = await getActiveOrderNav();

        if (!result.success) throw new Error('expected success');
        expect(result.data[0].progressPercent).toBe(100);
    });

    it('returns 0 percent instead of dividing by zero', async () => {
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
            buildOrder({ plannedQuantity: 0, actualQuantity: 0 }),
        ] as never);

        const result = await getActiveOrderNav();

        if (!result.success) throw new Error('expected success');
        expect(result.data[0].progressPercent).toBe(0);
    });

    it('falls back through variant name to order number when product is missing', async () => {
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
            buildOrder({
                bom: { productVariant: { name: 'Varian A', product: null } },
            }),
            buildOrder({ id: 'order-2', bom: null }),
        ] as never);

        const result = await getActiveOrderNav();

        if (!result.success) throw new Error('expected success');
        expect(result.data[0].productName).toBe('Varian A');
        expect(result.data[1].productName).toBe('WO-260903-001');
    });

    it('handles null actualQuantity as zero', async () => {
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
            buildOrder({ actualQuantity: null }),
        ] as never);

        const result = await getActiveOrderNav();

        if (!result.success) throw new Error('expected success');
        expect(result.data[0].actualQuantity).toBe(0);
        expect(result.data[0].progressPercent).toBe(0);
    });
});
