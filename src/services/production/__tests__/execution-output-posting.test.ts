import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordFinishedGoodsOutput, triggerProductionOutputJournal } from '../execution-output-posting';
import { MovementType } from '@prisma/client';

// Mock prisma
vi.mock('@/lib/core/prisma', () => ({
    prisma: {},
}));

// Mock AccountingService
vi.mock('@/services/accounting/accounting-service', () => ({
    AccountingService: {
        recordInventoryMovement: vi.fn(),
    },
}));

// Mock InventoryCoreService
vi.mock('@/services/inventory/core-service', () => ({
    InventoryCoreService: {
        incrementStockWithCost: vi.fn(),
    },
}));

// Mock ProductionCostService
vi.mock('../cost-service', () => ({
    ProductionCostService: {
        calculateBatchCOGM: vi.fn(),
    },
}));

// Mock calculateBomCost
vi.mock('@/lib/utils/production-utils', () => ({
    calculateBomCost: vi.fn().mockReturnValue(100),
}));

// Mock reservation service
vi.mock('@/services/inventory/reservation-service', () => ({
    createStockReservation: vi.fn(),
    getSalesOrderResidualDemand: vi.fn(),
}));

describe('execution-output-posting', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('recordFinishedGoodsOutput', () => {
        it('should not record output when quantity is 0', async () => {
            // Arrange
            const mockTx = {
                productVariant: {
                    findUnique: vi.fn(),
                },
                bom: {
                    findFirst: vi.fn(),
                },
                stockMovement: {
                    create: vi.fn(),
                },
            };

            const order = {
                id: 'po-1',
                locationId: 'loc-1',
                bom: { productVariantId: 'pv-1' },
            };

            // Act
            await recordFinishedGoodsOutput({
                tx: mockTx as any,
                productionOrderId: 'po-1',
                order: order as any,
                quantityProduced: 0,
                reference: 'Test',
            });

            // Assert
            expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
        });

        it('should record output with COGM cost', async () => {
            // Arrange
            const { ProductionCostService } = await import('../cost-service');
            vi.mocked(ProductionCostService.calculateBatchCOGM).mockResolvedValue(50);

            const mockTx = {
                productVariant: {
                    findUnique: vi.fn(),
                },
                bom: {
                    findFirst: vi.fn(),
                },
                stockMovement: {
                    create: vi.fn().mockResolvedValue({ id: 'movement-1' }),
                },
            };

            const order = {
                id: 'po-1',
                locationId: 'loc-1',
                bom: { productVariantId: 'pv-1' },
            };

            // Act
            await recordFinishedGoodsOutput({
                tx: mockTx as any,
                productionOrderId: 'po-1',
                order: order as any,
                quantityProduced: 100,
                reference: 'Production Output',
            });

            // Assert
            expect(mockTx.stockMovement.create).toHaveBeenCalledWith({
                data: {
                    type: MovementType.IN,
                    productVariantId: 'pv-1',
                    toLocationId: 'loc-1',
                    quantity: 100,
                    cost: 50,
                    reference: 'Production Output',
                    productionOrderId: 'po-1',
                },
            });

            const { createStockReservation } = await import('@/services/inventory/reservation-service');
            expect(createStockReservation).not.toHaveBeenCalled();
        });

        it('should fallback to variant cost when COGM is 0', async () => {
            // Arrange
            const { ProductionCostService } = await import('../cost-service');
            vi.mocked(ProductionCostService.calculateBatchCOGM).mockResolvedValue(0);

            const mockTx = {
                productVariant: {
                    findUnique: vi.fn().mockResolvedValue({
                        standardCost: 30,
                        buyPrice: 25,
                        price: 20,
                    }),
                },
                bom: {
                    findFirst: vi.fn(),
                },
                stockMovement: {
                    create: vi.fn().mockResolvedValue({ id: 'movement-1' }),
                },
            };

            const order = {
                id: 'po-1',
                locationId: 'loc-1',
                bom: { productVariantId: 'pv-1' },
            };

            // Act
            await recordFinishedGoodsOutput({
                tx: mockTx as any,
                productionOrderId: 'po-1',
                order: order as any,
                quantityProduced: 100,
                reference: 'Production Output',
            });

            // Assert
            expect(mockTx.stockMovement.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    cost: 30,
                }),
            });

            const { createStockReservation } = await import('@/services/inventory/reservation-service');
            expect(createStockReservation).not.toHaveBeenCalled();
        });

        it('should record output even when all costs are 0', async () => {
            // Arrange
            const { ProductionCostService } = await import('../cost-service');
            vi.mocked(ProductionCostService.calculateBatchCOGM).mockResolvedValue(0);

            const mockTx = {
                productVariant: {
                    findUnique: vi.fn().mockResolvedValue({
                        standardCost: null,
                        buyPrice: null,
                        price: null,
                    }),
                },
                bom: {
                    findFirst: vi.fn().mockResolvedValue(null),
                },
                stockMovement: {
                    create: vi.fn().mockResolvedValue({ id: 'movement-1' }),
                },
            };

            const order = {
                id: 'po-1',
                locationId: 'loc-1',
                bom: { productVariantId: 'pv-1' },
            };

            // Act
            await recordFinishedGoodsOutput({
                tx: mockTx as any,
                productionOrderId: 'po-1',
                order: order as any,
                quantityProduced: 100,
                reference: 'Production Output',
            });

            // Assert
            expect(mockTx.stockMovement.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    cost: 0,
                }),
            });

            const { createStockReservation } = await import('@/services/inventory/reservation-service');
            expect(createStockReservation).not.toHaveBeenCalled();
        });

        it('should auto-reserve stock when salesOrderId is present and residual demand > 0', async () => {
            // Arrange
            const { createStockReservation, getSalesOrderResidualDemand } = await import('@/services/inventory/reservation-service');
            vi.mocked(getSalesOrderResidualDemand).mockResolvedValue(80);
            vi.mocked(createStockReservation).mockResolvedValue({ id: 'res-abc' } as any);

            const mockTx = {
                productVariant: {
                    findUnique: vi.fn(),
                },
                bom: {
                    findFirst: vi.fn(),
                },
                salesOrder: {
                    findUnique: vi.fn().mockResolvedValue({
                        expectedDate: new Date('2026-12-31T00:00:00Z'),
                    }),
                },
                stockMovement: {
                    create: vi.fn().mockResolvedValue({ id: 'movement-1' }),
                },
            };

            const order = {
                id: 'po-1',
                locationId: 'loc-1',
                salesOrderId: 'so-1',
                bom: { productVariantId: 'pv-1' },
            };

            // Act
            await recordFinishedGoodsOutput({
                tx: mockTx as any,
                productionOrderId: 'po-1',
                order: order as any,
                quantityProduced: 100, // Produced 100, residual is 80 -> should reserve 80
                reference: 'Production Output',
            });

            // Assert
            expect(getSalesOrderResidualDemand).toHaveBeenCalledWith('so-1', 'pv-1', mockTx);
            expect(createStockReservation).toHaveBeenCalledWith({
                productVariantId: 'pv-1',
                locationId: 'loc-1',
                quantity: 80,
                reservedFor: 'SALES_ORDER',
                referenceId: 'so-1',
                reservedUntil: expect.any(Date),
            }, mockTx);
            expect(mockTx.stockMovement.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    reference: 'Production Output | RESERVE:res-abc',
                    quantity: 100,
                }),
            });
        });
    });

    describe('triggerProductionOutputJournal', () => {
        it('should be a no-op', async () => {
            // Act
            await triggerProductionOutputJournal('exec-1', 100);

            // Assert - no error thrown, function is a no-op
        });
    });
});
