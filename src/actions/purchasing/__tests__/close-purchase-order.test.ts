import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: vi.fn() }));
vi.mock('@/services/purchasing/close-order-service', () => ({ closeOrder: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { requireAuth } from '@/lib/tools/auth-checks';
import { closeOrder } from '@/services/purchasing/close-order-service';
import { revalidatePath } from 'next/cache';
import { closePurchaseOrder } from '../close-purchase-order';

function user(role: string, roles: string[] = [role]) {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: 'actor', role, roles } } as never);
}

describe('closePurchaseOrder action authorization', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(closeOrder).mockResolvedValue({ id: 'po', status: 'CLOSED' });
    });
    it.each(['ADMIN', 'PROCUREMENT'])('allows %s, uses session actor and invalidates affected views', async role => {
        user(role);
        const result = await closePurchaseOrder('po', 'reason');
        expect(result.success).toBe(true);
        expect(closeOrder).toHaveBeenCalledWith('po', 'reason', 'actor');
        for (const path of ['/purchasing/orders', '/purchasing/orders/po', '/warehouse/incoming', '/warehouse/mobile/incoming']) {
            expect(revalidatePath).toHaveBeenCalledWith(path);
        }
    });
    it('honors assigned procurement role', async () => {
        user('PLANNING', ['PLANNING', 'PROCUREMENT']);
        expect((await closePurchaseOrder('po', 'reason')).success).toBe(true);
    });
    it.each(['PLANNING', 'WAREHOUSE', 'FINANCE', 'PRODUCTION'])('denies %s before service', async role => {
        user(role);
        expect((await closePurchaseOrder('po', 'reason')).success).toBe(false);
        expect(closeOrder).not.toHaveBeenCalled();
        expect(revalidatePath).not.toHaveBeenCalled();
    });
    it('denies unauthenticated requests', async () => {
        vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));
        expect((await closePurchaseOrder('po', 'reason')).success).toBe(false);
        expect(closeOrder).not.toHaveBeenCalled();
    });
    it('returns failure and does not invalidate on rejected close', async () => {
        user('ADMIN');
        vi.mocked(closeOrder).mockRejectedValue(new Error('already closed'));
        expect((await closePurchaseOrder('po', 'reason')).success).toBe(false);
        expect(revalidatePath).not.toHaveBeenCalled();
    });
});
