import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => {
    const mockPrisma = {
        purchaseOrder: {
            findMany: vi.fn().mockResolvedValue([]),
            groupBy: vi.fn().mockResolvedValue([]),
        },
        purchaseInvoice: {
            findMany: vi.fn().mockResolvedValue([]),
        },
        supplier: {
            findMany: vi.fn().mockResolvedValue([]),
        },
    };
    return { mockPrisma };
});

vi.mock('@/lib/core/prisma', () => ({
    prisma: mockPrisma,
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

vi.mock('@/lib/errors/errors', () => ({
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            const data = await fn();
            return { success: true as const, data };
        } catch (e) {
            return {
                success: false as const,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    },
}));

import { requireAuth } from '@/lib/tools/auth-checks';
import { getPurchasingAnalytics } from '../purchasing-analytics';

function mockSession(role: string) {
    return {
        user: { id: 'u1', name: 'Test', role, roles: [role] },
    } as any;
}

describe('purchasing-analytics action authorization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('allows ADMIN', async () => {
        vi.mocked(requireAuth).mockResolvedValue(mockSession('ADMIN'));
        const res = await getPurchasingAnalytics();
        expect(res.success).toBe(true);
    });

    it('allows PROCUREMENT', async () => {
        vi.mocked(requireAuth).mockResolvedValue(mockSession('PROCUREMENT'));
        const res = await getPurchasingAnalytics();
        expect(res.success).toBe(true);
    });

    it('allows PLANNING', async () => {
        vi.mocked(requireAuth).mockResolvedValue(mockSession('PLANNING'));
        const res = await getPurchasingAnalytics();
        expect(res.success).toBe(true);
    });

    it('allows FINANCE', async () => {
        vi.mocked(requireAuth).mockResolvedValue(mockSession('FINANCE'));
        const res = await getPurchasingAnalytics();
        expect(res.success).toBe(true);
    });

    it('rejects WAREHOUSE', async () => {
        vi.mocked(requireAuth).mockResolvedValue(mockSession('WAREHOUSE'));
        const res = await getPurchasingAnalytics();
        expect(res.success).toBe(false);
    });

    it('rejects HRD', async () => {
        vi.mocked(requireAuth).mockResolvedValue(mockSession('HRD'));
        const res = await getPurchasingAnalytics();
        expect(res.success).toBe(false);
    });

    it('rejects SALES', async () => {
        vi.mocked(requireAuth).mockResolvedValue(mockSession('SALES'));
        const res = await getPurchasingAnalytics();
        expect(res.success).toBe(false);
    });

    it('rejects PRODUCTION', async () => {
        vi.mocked(requireAuth).mockResolvedValue(mockSession('PRODUCTION'));
        const res = await getPurchasingAnalytics();
        expect(res.success).toBe(false);
    });

    it('rejects when no session', async () => {
        vi.mocked(requireAuth).mockRejectedValue(new Error('No session'));
        const res = await getPurchasingAnalytics();
        expect(res.success).toBe(false);
    });
});
