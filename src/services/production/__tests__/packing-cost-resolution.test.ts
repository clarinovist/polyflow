/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveMaterialLocation } from '../execution-material-location';
import { PackingReportService } from '../packing-report-service';
import { prisma } from '@/lib/core/prisma';

vi.mock('@/lib/core/prisma', () => {
    const mockPrisma = {
        inventory: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
            upsert: vi.fn(),
        },
        location: {
            findUnique: vi.fn(),
        },
        productionExecution: {
            findMany: vi.fn(),
        },
    };
    return { prisma: mockPrisma };
});

vi.mock('@/services/inventory/core-service', () => ({
    InventoryCoreService: {
        incrementStockWithCost: vi.fn(),
    }
}));

describe('Packing and Costing Resolution Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('resolveMaterialLocation for PACKING category', () => {
        it('prioritizes order location if stock is available', async () => {
            const tx: any = {
                inventory: {
                    findUnique: vi.fn().mockResolvedValue({
                        quantity: { toNumber: () => 10 }
                    }),
                },
            };

            const order: any = {
                id: 'po-1',
                locationId: 'packing_area_id',
                isMaklon: false,
                bom: { category: 'PACKING' }
            };

            const result = await resolveMaterialLocation(tx, order, 'variant-1');
            expect(result).toBe('packing_area_id');
            expect(tx.inventory.findUnique).toHaveBeenCalledWith({
                where: {
                    locationId_productVariantId: {
                        locationId: 'packing_area_id',
                        productVariantId: 'variant-1'
                    }
                },
                select: { quantity: true }
            });
        });

        it('searches candidate locations if no stock is available in order location', async () => {
            const mockLocationMap = new Map<string, string>([
                ['fg_warehouse', 'fg_loc_id'],
                ['rm_warehouse', 'rm_loc_id'],
                ['packing_area', 'packing_loc_id']
            ]);

            const tx: any = {
                location: {
                    findUnique: vi.fn().mockImplementation((args: any) => {
                        const slug = args.where.slug;
                        const id = mockLocationMap.get(slug);
                        return id ? Promise.resolve({ id }) : Promise.resolve(null);
                    })
                },
                inventory: {
                    findUnique: vi.fn().mockImplementation((args: any) => {
                        if (args.where.locationId_productVariantId.locationId === 'packing_area_id') {
                            return Promise.resolve({ quantity: { toNumber: () => 0 } });
                        }
                        if (args.where.locationId_productVariantId.locationId === 'fg_loc_id') {
                            return Promise.resolve({ quantity: { toNumber: () => 0 } });
                        }
                        if (args.where.locationId_productVariantId.locationId === 'rm_loc_id') {
                            return Promise.resolve({ quantity: { toNumber: () => 5 } });
                        }
                        return Promise.resolve(null);
                    })
                }
            };

            const order: any = {
                id: 'po-1',
                locationId: 'packing_area_id',
                isMaklon: false,
                bom: { category: 'PACKING' }
            };

            const result = await resolveMaterialLocation(tx, order, 'variant-1');
            expect(result).toBe('rm_loc_id');
        });

        it('does not use raw material warehouse candidate for REWORK orders', async () => {
            const tx: any = {
                location: {
                    findUnique: vi.fn().mockResolvedValue({ id: 'fg_loc_id' })
                },
                inventory: {
                    findUnique: vi.fn().mockResolvedValue({ quantity: { toNumber: () => 0 } })
                }
            };

            const order: any = {
                id: 'po-1',
                locationId: 'rework_area_id',
                isMaklon: false,
                bom: { category: 'REWORK' }
            };

            const result = await resolveMaterialLocation(tx, order, 'variant-1');
            expect(result).toBe('fg_loc_id');
            expect(tx.location.findUnique).toHaveBeenCalledTimes(1);
            expect(tx.location.findUnique).toHaveBeenCalledWith({ where: { slug: 'fg_warehouse' } });
        });
    });

    describe('PackingReportService aggregation', () => {
        it('aggregates finished goods production executions for Packing Area in selected month', async () => {
            const mockExecutions: any[] = [
                {
                    id: 'exec-1',
                    productionOrderId: 'po-1',
                    quantityProduced: 100,
                    endTime: new Date('2026-06-12T10:00:00Z'),
                    productionOrder: {
                        id: 'po-1',
                        orderNumber: 'WO-PACK-001',
                        bom: {
                            category: 'PACKING',
                            productVariant: {
                                id: 'pv-fg-red',
                                name: 'Packing Merah',
                                skuCode: 'FG-PACK-RED',
                                primaryUnit: 'PACK',
                                standardCost: 16650,
                                product: { name: 'Packing Merah Product' }
                            }
                        },
                        stockMovements: [
                            { productVariantId: 'pv-fg-red', type: 'IN', quantity: 100, cost: 16650 }
                        ]
                    }
                }
            ];

            vi.mocked(prisma.productionExecution.findMany).mockResolvedValue(mockExecutions as any);

            const result = await PackingReportService.getMonthlyPackingReport('2026-06');
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                productVariantId: 'pv-fg-red',
                productName: 'Packing Merah Product',
                skuCode: 'FG-PACK-RED',
                totalQuantity: 100,
                primaryUnit: 'PACK',
                workOrderCount: 1,
                averageHpp: 16650,
                totalCost: 1665000
            });
        });
    });
});
