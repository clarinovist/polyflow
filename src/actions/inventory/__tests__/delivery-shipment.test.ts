import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    commit: vi.fn(),
    revalidate: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: unknown) => fn,
}));
vi.mock('@/lib/tools/auth-checks', () => ({
    requireWarehouseResourcePermission: mocks.auth,
}));
vi.mock('@/services/sales/delivery-fulfillment-service', () => ({
    commitDeliveryShipment: mocks.commit,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

import { shipDeliveryOrder } from '../delivery-shipment';

describe('shipDeliveryOrder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: 'warehouse-1' } });
        mocks.commit.mockResolvedValue({ success: true, invoicePending: false });
    });

    it('passes the validated actual date to the shipment service', async () => {
        const result = await shipDeliveryOrder({
            deliveryOrderId: 'do-1',
            actualShipmentDate: '2026-10-05',
        });
        expect(result.success).toBe(true);
        expect(mocks.commit).toHaveBeenCalledWith('do-1', 'warehouse-1', {
            actualShipmentDate: expect.any(Date),
        });
    });

    it('rejects an invalid date before committing stock', async () => {
        const result = await shipDeliveryOrder({
            deliveryOrderId: 'do-1',
            actualShipmentDate: '2026-02-30',
        });
        expect(result.success).toBe(false);
        expect(mocks.commit).not.toHaveBeenCalled();
    });
});
