/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBackflushQuantity } from '../execution-material-consumption';
import { PackingReportService } from '../packing-report-service';
import { resolveMaterialLocation } from '../execution-material-location';
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
        stockMovement: {
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
                            { id: 'sm-1', productVariantId: 'pv-fg-red', type: 'IN', quantity: 100, cost: 16650, createdAt: new Date('2026-06-12T10:00:00Z'), productVariant: { attributes: null, product: { name: 'Packing Merah' } } }
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
                karungConsumed: 0,
                karungCost: 0,
                averageHpp: 16650,
                totalCost: 1665000
            });
        });

        it('tracks karung consumed and cost from OUT movements with FLOOR_ENTERED_BAL rule', async () => {
            const mockExecutions: any[] = [
                {
                    id: 'exec-1',
                    productionOrderId: 'po-1',
                    quantityProduced: 62,
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
                                standardCost: 15000,
                                product: { name: 'Packing Merah' }
                            }
                        },
                        stockMovements: [
                            { id: 'sm-in-1', productVariantId: 'pv-fg-red', type: 'IN', quantity: 62, cost: 15000, createdAt: new Date('2026-06-12T10:00:00Z'), productVariant: { attributes: null, product: { name: 'Packing Merah' } } },
                            { id: 'sm-out-1', productVariantId: 'pv-karung', type: 'OUT', quantity: 6, cost: 1650, createdAt: new Date('2026-06-12T10:00:00Z'), productVariant: { attributes: { consumptionRule: 'FLOOR_ENTERED_BAL' }, product: { name: 'Karung Besar' } } }
                        ]
                    }
                }
            ];

            vi.mocked(prisma.productionExecution.findMany).mockResolvedValue(mockExecutions as any);

            const result = await PackingReportService.getMonthlyPackingReport('2026-06');
            expect(result).toHaveLength(1);
            expect(result[0].karungConsumed).toBe(6);
            expect(result[0].karungCost).toBe(9900); // 6 × 1650
            // averageHpp = totalCost / totalQty (FG cost only, karung tracked separately)
            expect(result[0].averageHpp).toBeCloseTo(15000, 0);
        });

        it('returns empty array when no executions exist for the month', async () => {
            vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([]);

            const result = await PackingReportService.getMonthlyPackingReport('2026-01');
            expect(result).toEqual([]);
        });
    });

    describe('backflush quantity for whole-BAL packaging materials', () => {
        const baseOrder: any = {
            plannedQuantity: 100,
            bom: {
                category: 'PACKING',
                outputQuantity: 100,
            }
        };

        const karungItem: any = {
            productVariantId: 'pv-karung',
            quantity: 1,
            productVariant: {
                name: 'KARUNG BESAR',
                skuCode: 'RMKAR001',
                primaryUnit: 'PACK',
                attributes: { consumptionRule: 'FLOOR_ENTERED_BAL' },
                product: { productType: 'RAW_MATERIAL' as const }
            }
        };

        describe('FLOOR_ENTERED_BAL rule with attributes', () => {
            it('uses floor(entered BAL) for karung with FLOOR_ENTERED_BAL attribute', () => {
                const qty = resolveBackflushQuantity({
                    item: karungItem,
                    order: baseOrder,
                    totalConsumed: 62,
                    isUsingPlanned: false,
                    outputContext: {
                        enteredQuantity: 6.2,
                        enteredUnit: 'BAL',
                        baseQuantity: 62
                    }
                });
                expect(qty).toBe(6);
            });

            it('uses floor(7.0) = 7 for exact BAL value', () => {
                const qty = resolveBackflushQuantity({
                    item: karungItem,
                    order: baseOrder,
                    totalConsumed: 70,
                    isUsingPlanned: false,
                    outputContext: {
                        enteredQuantity: 7.0,
                        enteredUnit: 'BAL',
                        baseQuantity: 70
                    }
                });
                expect(qty).toBe(7);
            });

            it('uses floor(6.9) = 6 for fractional BAL value', () => {
                const qty = resolveBackflushQuantity({
                    item: karungItem,
                    order: baseOrder,
                    totalConsumed: 69,
                    isUsingPlanned: false,
                    outputContext: {
                        enteredQuantity: 6.9,
                        enteredUnit: 'BAL',
                        baseQuantity: 69
                    }
                });
                expect(qty).toBe(6);
            });

            it('uses floor(0.5) = 0 for small fractional BAL — qty <= 0.0001 will skip', () => {
                const qty = resolveBackflushQuantity({
                    item: karungItem,
                    order: baseOrder,
                    totalConsumed: 5,
                    isUsingPlanned: false,
                    outputContext: {
                        enteredQuantity: 0.5,
                        enteredUnit: 'BAL',
                        baseQuantity: 5
                    }
                });
                expect(qty).toBe(0);
            });

            it('uses floor(0.1) = 0 — edge case near zero', () => {
                const qty = resolveBackflushQuantity({
                    item: karungItem,
                    order: baseOrder,
                    totalConsumed: 1,
                    isUsingPlanned: false,
                    outputContext: {
                        enteredQuantity: 0.1,
                        enteredUnit: 'BAL',
                        baseQuantity: 1
                    }
                });
                expect(qty).toBe(0);
            });
        });

        describe('PROPORTIONAL fallback', () => {
            it('keeps proportional quantity for non-karung material', () => {
                const rollItem: any = {
                    productVariantId: 'pv-roll',
                    quantity: 44.63,
                    productVariant: {
                        name: 'Roll Merah 28',
                        skuCode: 'FGROL041',
                        primaryUnit: 'KG',
                        attributes: null,
                        product: { productType: 'INTERMEDIATE' as const }
                    }
                };

                const qty = resolveBackflushQuantity({
                    item: rollItem,
                    order: baseOrder,
                    totalConsumed: 81.75,
                    isUsingPlanned: false,
                    outputContext: {
                        enteredQuantity: 6.2,
                        enteredUnit: 'BAL',
                        baseQuantity: 81.75
                    }
                });
                expect(qty).toBeCloseTo(81.75 * (44.63 / 100), 6);
            });

            it('falls back to proportional when enteredUnit is not BAL', () => {
                const qty = resolveBackflushQuantity({
                    item: karungItem,
                    order: baseOrder,
                    totalConsumed: 62,
                    isUsingPlanned: false,
                    outputContext: {
                        enteredQuantity: 62,
                        enteredUnit: 'KG',
                        baseQuantity: 62
                    }
                });
                // Proportional: 62 * (1/100) = 0.62
                expect(qty).toBeCloseTo(0.62, 6);
            });

            it('falls back to proportional when enteredQuantity is null', () => {
                const qty = resolveBackflushQuantity({
                    item: karungItem,
                    order: baseOrder,
                    totalConsumed: 62,
                    isUsingPlanned: false,
                    outputContext: {
                        enteredQuantity: null,
                        enteredUnit: 'BAL',
                        baseQuantity: 62
                    }
                });
                // Proportional: 62 * (1/100) = 0.62
                expect(qty).toBeCloseTo(0.62, 6);
            });

            it('falls back to proportional when enteredUnit is null', () => {
                const qty = resolveBackflushQuantity({
                    item: karungItem,
                    order: baseOrder,
                    totalConsumed: 62,
                    isUsingPlanned: false,
                    outputContext: {
                        enteredQuantity: 6.2,
                        enteredUnit: null,
                        baseQuantity: 62
                    }
                });
                // Proportional: 62 * (1/100) = 0.62
                expect(qty).toBeCloseTo(0.62, 6);
            });

            it('falls back to proportional when outputContext is undefined', () => {
                const qty = resolveBackflushQuantity({
                    item: karungItem,
                    order: baseOrder,
                    totalConsumed: 62,
                    isUsingPlanned: false,
                    outputContext: undefined
                });
                expect(qty).toBeCloseTo(0.62, 6);
            });
        });

        describe('Attributes JSON edge cases', () => {
            it('defaults to PROPORTIONAL when attributes is null', () => {
                const item: any = {
                    ...karungItem,
                    productVariant: { ...karungItem.productVariant, attributes: null }
                };
                const qty = resolveBackflushQuantity({
                    item,
                    order: baseOrder,
                    totalConsumed: 62,
                    isUsingPlanned: false,
                    outputContext: { enteredQuantity: 6.2, enteredUnit: 'BAL', baseQuantity: 62 }
                });
                expect(qty).toBeCloseTo(0.62, 6);
            });

            it('defaults to PROPORTIONAL when attributes is undefined', () => {
                const item: any = {
                    ...karungItem,
                    productVariant: { ...karungItem.productVariant, attributes: undefined }
                };
                const qty = resolveBackflushQuantity({
                    item,
                    order: baseOrder,
                    totalConsumed: 62,
                    isUsingPlanned: false,
                    outputContext: { enteredQuantity: 6.2, enteredUnit: 'BAL', baseQuantity: 62 }
                });
                expect(qty).toBeCloseTo(0.62, 6);
            });

            it('defaults to PROPORTIONAL when attributes is a string', () => {
                const item: any = {
                    ...karungItem,
                    productVariant: { ...karungItem.productVariant, attributes: 'invalid' }
                };
                const qty = resolveBackflushQuantity({
                    item,
                    order: baseOrder,
                    totalConsumed: 62,
                    isUsingPlanned: false,
                    outputContext: { enteredQuantity: 6.2, enteredUnit: 'BAL', baseQuantity: 62 }
                });
                expect(qty).toBeCloseTo(0.62, 6);
            });

            it('defaults to PROPORTIONAL when attributes is an array', () => {
                const item: any = {
                    ...karungItem,
                    productVariant: { ...karungItem.productVariant, attributes: [1, 2, 3] }
                };
                const qty = resolveBackflushQuantity({
                    item,
                    order: baseOrder,
                    totalConsumed: 62,
                    isUsingPlanned: false,
                    outputContext: { enteredQuantity: 6.2, enteredUnit: 'BAL', baseQuantity: 62 }
                });
                expect(qty).toBeCloseTo(0.62, 6);
            });

            it('defaults to PROPORTIONAL when consumptionRule is unknown string', () => {
                const item: any = {
                    ...karungItem,
                    productVariant: { ...karungItem.productVariant, attributes: { consumptionRule: 'UNKNOWN_RULE' } }
                };
                const qty = resolveBackflushQuantity({
                    item,
                    order: baseOrder,
                    totalConsumed: 62,
                    isUsingPlanned: false,
                    outputContext: { enteredQuantity: 6.2, enteredUnit: 'BAL', baseQuantity: 62 }
                });
                expect(qty).toBeCloseTo(0.62, 6);
            });
        });

        describe('BOM category guard', () => {
            it('does not apply FLOOR_ENTERED_BAL for EXTRUSION BOM even with attribute set', () => {
                const extrusionOrder: any = {
                    plannedQuantity: 100,
                    bom: { category: 'EXTRUSION', outputQuantity: 100 }
                };
                const qty = resolveBackflushQuantity({
                    item: karungItem,
                    order: extrusionOrder,
                    totalConsumed: 62,
                    isUsingPlanned: false,
                    outputContext: { enteredQuantity: 6.2, enteredUnit: 'BAL', baseQuantity: 62 }
                });
                // Proportional: 62 * (1/100) = 0.62
                expect(qty).toBeCloseTo(0.62, 6);
            });

            it('does not apply FLOOR_ENTERED_BAL for MIXING BOM', () => {
                const mixingOrder: any = {
                    plannedQuantity: 100,
                    bom: { category: 'MIXING', outputQuantity: 100 }
                };
                const qty = resolveBackflushQuantity({
                    item: karungItem,
                    order: mixingOrder,
                    totalConsumed: 62,
                    isUsingPlanned: false,
                    outputContext: { enteredQuantity: 6.2, enteredUnit: 'BAL', baseQuantity: 62 }
                });
                expect(qty).toBeCloseTo(0.62, 6);
            });

            it('does not apply FLOOR_ENTERED_BAL for REWORK BOM', () => {
                const reworkOrder: any = {
                    plannedQuantity: 100,
                    bom: { category: 'REWORK', outputQuantity: 100 }
                };
                const qty = resolveBackflushQuantity({
                    item: karungItem,
                    order: reworkOrder,
                    totalConsumed: 62,
                    isUsingPlanned: false,
                    outputContext: { enteredQuantity: 6.2, enteredUnit: 'BAL', baseQuantity: 62 }
                });
                expect(qty).toBeCloseTo(0.62, 6);
            });
        });

        describe('CEIL_ENTERED_BAL rule', () => {
            it('uses ceil(6.2) = 7 for karung with CEIL_ENTERED_BAL attribute', () => {
                const ceilItem: any = {
                    ...karungItem,
                    productVariant: {
                        ...karungItem.productVariant,
                        attributes: { consumptionRule: 'CEIL_ENTERED_BAL' }
                    }
                };
                const qty = resolveBackflushQuantity({
                    item: ceilItem,
                    order: baseOrder,
                    totalConsumed: 62,
                    isUsingPlanned: false,
                    outputContext: { enteredQuantity: 6.2, enteredUnit: 'BAL', baseQuantity: 62 }
                });
                expect(qty).toBe(7);
            });

            it('uses ceil(7.0) = 7 for exact BAL with CEIL', () => {
                const ceilItem: any = {
                    ...karungItem,
                    productVariant: {
                        ...karungItem.productVariant,
                        attributes: { consumptionRule: 'CEIL_ENTERED_BAL' }
                    }
                };
                const qty = resolveBackflushQuantity({
                    item: ceilItem,
                    order: baseOrder,
                    totalConsumed: 70,
                    isUsingPlanned: false,
                    outputContext: { enteredQuantity: 7.0, enteredUnit: 'BAL', baseQuantity: 70 }
                });
                expect(qty).toBe(7);
            });
        });

        describe('Range validation (enteredQuantity > 0 && <= 10000)', () => {
            it('skips rule and falls back to proportional when enteredQuantity is 0', () => {
                const qty = resolveBackflushQuantity({
                    item: karungItem,
                    order: baseOrder,
                    totalConsumed: 100,
                    isUsingPlanned: false,
                    outputContext: { enteredQuantity: 0, enteredUnit: 'BAL', baseQuantity: 100 }
                });
                // 0 fails the > 0 check, so falls back to proportional
                expect(qty).toBeCloseTo(100 * (1 / 100), 6);
            });
        });
    });
});
