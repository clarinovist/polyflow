import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PurchaseOrderStatus } from '@prisma/client';

const count = vi.hoisted(() => vi.fn());
vi.mock('@/lib/core/prisma', () => ({
    prisma: { purchaseOrder: { count } },
}));

import { getExecutivePurchasingMetrics } from '../executive-metrics-service';

describe('getExecutivePurchasingMetrics', () => {
    beforeEach(() => vi.clearAllMocks());

    it('counts the same pending PO statuses as the purchasing dashboard', async () => {
        count.mockResolvedValue(3);

        await expect(getExecutivePurchasingMetrics()).resolves.toEqual({
            pendingPOs: 3,
        });
        expect(count).toHaveBeenCalledWith({
            where: {
                status: {
                    in: [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.SENT],
                },
            },
        });
    });
});
