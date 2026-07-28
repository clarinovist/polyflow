import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getPurchasingMobileOverview } from '../mobile-dashboard';
import { prisma } from '@/lib/core/prisma';
import { auth } from '@/auth';

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
        },
        purchaseOrder: {
            count: vi.fn(),
            findMany: vi.fn(),
        },
        purchaseInvoice: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: any) => fn,
    getTenantContext: () => ({ tenantId: 'test-tenant' }),
}));

describe('getPurchasingMobileOverview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'u1',
            role: 'PROCUREMENT',
            isActive: true,
        } as any);
    });

    it('returns empty overview when authenticated', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u1', role: 'PROCUREMENT' },
        } as any);

        vi.mocked(prisma.purchaseOrder.count).mockResolvedValue(0);
        vi.mocked(prisma.purchaseOrder.findMany).mockResolvedValue([]);
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([]);

        const result = await getPurchasingMobileOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.draftPoCount).toBe(0);
            expect(result.data.recentOrders).toEqual([]);
        }
    });

    it('returns overview with PO and AP details', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u1', role: 'PROCUREMENT' },
        } as any);

        vi.mocked(prisma.purchaseOrder.count)
            .mockResolvedValueOnce(3)
            .mockResolvedValueOnce(5);

        vi.mocked(prisma.purchaseOrder.findMany).mockResolvedValue([
            {
                id: 'po-1',
                orderNumber: 'PO-001',
                status: 'SENT',
                totalAmount: 15000000,
                supplier: { name: 'PT Biji Plastik Utama' },
            } as any,
        ]);

        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([
            { totalAmount: 5000000 } as any,
        ]);

        const result = await getPurchasingMobileOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.draftPoCount).toBe(3);
            expect(result.data.highlights.waitingReceiptCount).toBe(5);
            expect(result.data.highlights.overdueApCount).toBe(1);
            expect(result.data.highlights.overdueApAmount).toBe(5000000);
            expect(result.data.recentOrders[0].poNumber).toBe('PO-001');
        }
    });
});
