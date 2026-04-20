import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/core/prisma';
import { CostingService } from '../accounting/costing-service';

const decimal = (value: number) => ({
    toNumber: () => value,
    valueOf: () => value,
});

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: {
            findUnique: vi.fn(),
        }
    }
}));

describe('CostingService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should calculate material cost using persisted issue movement cost', async () => {
        const issuedAt = new Date('2026-04-20T10:00:00.000Z');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.productionOrder.findUnique as any).mockResolvedValue({
            id: 'po-1',
            orderNumber: 'WO-001',
            actualQuantity: decimal(10),
            materialIssues: [
                {
                    id: 'issue-1',
                    status: 'ISSUED',
                    quantity: decimal(5),
                    issuedAt,
                    productVariantId: 'pv-1',
                    batchId: 'batch-1',
                    locationId: 'loc-1',
                    productVariant: {
                        standardCost: decimal(100),
                        buyPrice: null,
                        price: null,
                    }
                },
                {
                    id: 'issue-2',
                    status: 'VOIDED',
                    quantity: decimal(3),
                    issuedAt,
                    productVariantId: 'pv-2',
                    batchId: null,
                    locationId: 'loc-1',
                    productVariant: {
                        standardCost: decimal(999),
                        buyPrice: null,
                        price: null,
                    }
                }
            ],
            stockMovements: [
                {
                    id: 'move-1',
                    productVariantId: 'pv-1',
                    batchId: 'batch-1',
                    fromLocationId: 'loc-1',
                    quantity: decimal(5),
                    cost: decimal(42),
                    createdAt: new Date('2026-04-20T10:00:30.000Z')
                }
            ],
            executions: []
        });

        const result = await CostingService.calculateOrderCost('po-1');

        expect(result.materialCost).toBe(210);
        expect(result.totalCost).toBe(210);
        expect(result.unitCost).toBe(21);
    });
});