import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveQuotationOrderId } from '../sales';
import { prisma } from '@/lib/core/prisma';

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        salesOrder: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesAccess: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
    requireSalesApprover: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/sales/sales-service', () => ({
    SalesService: {},
}));

vi.mock('@/services/sales/quotation-service', () => ({
    sendQuotation: vi.fn(),
    acceptQuotation: vi.fn(),
    rejectQuotation: vi.fn(),
    reopenQuotation: vi.fn(),
}));

vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const findUnique = vi.mocked(prisma.salesOrder.findUnique);

describe('resolveQuotationOrderId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the Sales Order id when the order exists', async () => {
        // Arrange
        findUnique.mockResolvedValue({ id: 'so-456' } as never);

        // Act
        const res = await resolveQuotationOrderId('so-456');

        // Assert
        expect(res).toEqual({ success: true, data: 'so-456' });
        expect(findUnique).toHaveBeenCalledWith({
            where: { id: 'so-456' },
            select: { id: true },
        });
    });

    it('returns null for a stale quotation link so the shim can 404', async () => {
        // Arrange
        findUnique.mockResolvedValue(null as never);

        // Act
        const res = await resolveQuotationOrderId('legacy-quotation-1');

        // Assert
        expect(res).toEqual({ success: true, data: null });
    });
});
