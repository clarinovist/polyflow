import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {},
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesAccess: vi.fn().mockResolvedValue({
        user: { id: 'u1', role: 'SALES', roles: ['SALES'] },
    }),
    requireSalesManager: vi.fn().mockResolvedValue({
        user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
    }),
}));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: (data: unknown) => data,
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/errors/errors', async () => {
    const actual = (await vi.importActual('@/lib/errors/errors')) as any;
    return {
        ...actual,
        safeAction: async (fn: () => Promise<unknown>) => {
            try {
                const data = await fn();
                return { success: true, data };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        },
    };
});

vi.mock('@/services/sales/price-approval-service', () => ({
    approvePrice: vi.fn().mockResolvedValue({ id: 'so-1', priceStatus: 'PROVISIONAL' }),
    rejectPrice: vi.fn().mockResolvedValue({ id: 'so-1', priceStatus: 'PENDING' }),
}));

import { approvePriceAction, rejectPriceAction } from '../price-list';
import { requireSalesManager } from '@/lib/auth/sales-access';
import { approvePrice, rejectPrice } from '@/services/sales/price-approval-service';

describe('price-approval actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireSalesManager).mockResolvedValue({
            user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
        } as any);
        vi.mocked(approvePrice).mockResolvedValue({
            id: 'so-1',
            priceStatus: 'PROVISIONAL',
        } as never);
        vi.mocked(rejectPrice).mockResolvedValue({
            id: 'so-1',
            priceStatus: 'PENDING',
        } as never);
    });

    it('approvePriceAction allows ADMIN', async () => {
        const res = await approvePriceAction({ orderId: 'so-1' });
        expect(res!.success).toBe(true);
        expect(requireSalesManager).toHaveBeenCalled();
        expect(approvePrice).toHaveBeenCalledWith('so-1', 'admin', undefined);
    });

    it('approvePriceAction allows MARKETING', async () => {
        vi.mocked(requireSalesManager).mockResolvedValue({
            user: { id: 'm1', role: 'MARKETING', roles: ['MARKETING'] },
        } as any);
        const res = await approvePriceAction({ orderId: 'so-1', notes: 'ok' });
        expect(res!.success).toBe(true);
    });

    it('approvePriceAction rejects SALES (must be manager)', async () => {
        vi.mocked(requireSalesManager).mockRejectedValue(
            new Error('Unauthorized: Hanya admin atau marketing'),
        );
        const res = await approvePriceAction({ orderId: 'so-1' });
        expect(res!.success).toBe(false);
    });

    it('rejectPriceAction allows ADMIN with notes', async () => {
        const res = await rejectPriceAction({
            orderId: 'so-1',
            notes: 'harga terlalu rendah',
        });
        expect(res!.success).toBe(true);
        expect(requireSalesManager).toHaveBeenCalled();
    });

    it('rejectPriceAction rejects SALES role', async () => {
        vi.mocked(requireSalesManager).mockRejectedValue(
            new Error('Unauthorized: Hanya admin atau marketing'),
        );
        const res = await rejectPriceAction({
            orderId: 'so-1',
            notes: 'alasan',
        });
        expect(res!.success).toBe(false);
    });

    it('rejectPriceAction requires notes (zod validation)', async () => {
        const res = await rejectPriceAction({
            orderId: 'so-1',
            notes: '',
        } as any);
        expect(res!.success).toBe(false);
    });

    it('rejectPriceAction rejects when guard fails', async () => {
        vi.mocked(requireSalesManager).mockRejectedValue(new Error('Unauthorized'));
        const res = await rejectPriceAction({
            orderId: 'so-1',
            notes: 'alasan',
        });
        expect(res!.success).toBe(false);
    });
});
