import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/core/prisma';
import { getInventoryValuation } from '../inventory/analytics-service';

const decimal = (value: number) => ({
    toNumber: () => value,
    valueOf: () => value,
});

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        inventory: {
            findMany: vi.fn(),
        },
    }
}));

describe('inventory analytics valuation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should separate finance valuation from customer-owned valuation', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.inventory.findMany as any).mockResolvedValue([
            {
                productVariantId: 'pv-1',
                locationId: 'loc-1',
                quantity: decimal(10),
                averageCost: decimal(100),
                location: {
                    id: 'loc-1',
                    name: 'RM Warehouse',
                    locationType: 'INTERNAL',
                },
                productVariant: {
                    name: 'Resin A',
                    skuCode: 'RM-001',
                    buyPrice: decimal(95),
                },
            },
            {
                productVariantId: 'pv-2',
                locationId: 'loc-2',
                quantity: decimal(4),
                averageCost: decimal(250),
                location: {
                    id: 'loc-2',
                    name: 'Maklon Storage',
                    locationType: 'CUSTOMER_OWNED',
                },
                productVariant: {
                    name: 'Titipan Customer',
                    skuCode: 'MK-001',
                    buyPrice: decimal(250),
                },
            },
        ]);

        const result = await getInventoryValuation();

        expect(result.totalValuation).toBe(2000);
        expect(result.financeValuation).toBe(1000);
        expect(result.customerOwnedValuation).toBe(1000);
        expect(result.details).toHaveLength(2);
        expect(result.details[1].locationType).toBe('CUSTOMER_OWNED');
    });
});
