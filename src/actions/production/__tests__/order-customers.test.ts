import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/tools/auth-checks', () => ({ requirePlanningRole: vi.fn() }));
vi.mock('@/services/production/order-customer-service', async (original) => {
    const actual = await original<typeof import('@/services/production/order-customer-service')>();
    return { ...actual, updateOrderCustomers: vi.fn() };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { requirePlanningRole } from '@/lib/tools/auth-checks';
import { updateOrderCustomers } from '@/services/production/order-customer-service';
import { revalidatePath } from 'next/cache';
import { saveOrderCustomers } from '../order-customers';

describe('saveOrderCustomers', () => {
    beforeEach(() => { vi.clearAllMocks(); vi.mocked(requirePlanningRole).mockResolvedValue({ user: { id: 'actor' } } as never); });
    it('authorizes and revalidates board/detail after saving', async () => {
        expect((await saveOrderCustomers({ orderId: 'wo', customerIds: ['a'] })).success).toBe(true);
        expect(updateOrderCustomers).toHaveBeenCalledWith({ orderId: 'wo', customerIds: ['a'] }, 'actor');
        expect(revalidatePath).toHaveBeenCalledWith('/production/daily');
        expect(revalidatePath).toHaveBeenCalledWith('/production/orders/wo');
    });
    it('rejects unauthorized and invalid requests without mutations', async () => {
        vi.mocked(requirePlanningRole).mockRejectedValueOnce(new Error('Forbidden'));
        expect((await saveOrderCustomers({ orderId: 'wo', customerIds: [] })).success).toBe(false);
        expect((await saveOrderCustomers({ orderId: '', customerIds: [] })).success).toBe(false);
        expect(updateOrderCustomers).not.toHaveBeenCalled();
        expect(revalidatePath).not.toHaveBeenCalled();
    });
});
