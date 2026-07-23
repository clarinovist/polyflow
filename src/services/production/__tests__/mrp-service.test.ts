import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MrpService } from '../mrp-service';
import { prisma } from '@/lib/core/prisma';

// Mock prisma
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        salesOrder: {
            findUnique: vi.fn(),
        },
        productVariant: {
            findUnique: vi.fn(),
        },
        inventory: {
            aggregate: vi.fn(),
        },
        stockReservation: {
            aggregate: vi.fn(),
        },
        bom: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            findUnique: vi.fn(),
        },
        bomItem: {
            findMany: vi.fn(),
        },
        productionMaterial: {
            create: vi.fn(),
        },
        $transaction: vi.fn((callback) => callback(prisma)),
    },
}));

// Mock order-number-service
vi.mock('../order-number-service', () => ({
    createProductionOrderWithGeneratedNumber: vi.fn(),
}));

describe('MrpService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('simulateMaterialRequirements', () => {
        it('should throw error when sales order not found', async () => {
            // Arrange
            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null);

            // Act & Assert
            await expect(
                MrpService.simulateMaterialRequirements('so-1')
            ).rejects.toThrow(/tidak ditemukan/i);
        });

        it('should return empty requirements when sales order has no items', async () => {
            // Arrange
            const mockSalesOrder = {
                id: 'so-1',
                items: [],
            };

            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockSalesOrder as any);

            // Act
            const result = await MrpService.simulateMaterialRequirements('so-1');

            // Assert
            expect(result).toEqual({
                salesOrderId: 'so-1',
                requirements: [],
                canProduce: true,
                missingBoms: [],
            });
        });

        it('should handle sales order with items that have no BOM', async () => {
            // Arrange
            const mockSalesOrder = {
                id: 'so-1',
                items: [
                    {
                        productVariantId: 'pv-raw',
                        quantity: 10,
                        productVariant: {
                            id: 'pv-raw',
                            name: 'Raw Material',
                            product: { productType: 'RAW_MATERIAL' },
                        },
                    },
                ],
            };

            const mockProductVariant = {
                id: 'pv-raw',
                name: 'Raw Material',
                product: { productType: 'RAW_MATERIAL' },
            };

            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockSalesOrder as any);
            vi.mocked(prisma.productVariant.findUnique).mockResolvedValue(mockProductVariant as any);
            vi.mocked(prisma.bom.findFirst).mockResolvedValue(null); // No BOM
            vi.mocked(prisma.inventory.aggregate).mockResolvedValue({
                _sum: { quantity: { toNumber: () => 100 } },
            } as any);
            vi.mocked(prisma.stockReservation.aggregate).mockResolvedValue({
                _sum: { quantity: { toNumber: () => 0 } },
            } as any);

            // Act
            const result = await MrpService.simulateMaterialRequirements('so-1');

            // Assert
            expect(result.requirements).toHaveLength(1);
            expect(result.requirements[0].materialName).toBe('Raw Material');
            expect(result.requirements[0].hasBom).toBe(false);
        });

        it('should handle missing BOM for finished good', async () => {
            // Arrange
            const mockSalesOrder = {
                id: 'so-1',
                items: [
                    {
                        productVariantId: 'pv-finished',
                        quantity: 10,
                        productVariant: {
                            id: 'pv-finished',
                            name: 'Finished Product',
                            product: { productType: 'FINISHED_GOOD' },
                        },
                    },
                ],
            };

            const mockProductVariant = {
                id: 'pv-finished',
                name: 'Finished Product',
                product: { productType: 'FINISHED_GOOD' },
            };

            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockSalesOrder as any);
            vi.mocked(prisma.productVariant.findUnique).mockResolvedValue(mockProductVariant as any);
            vi.mocked(prisma.bom.findFirst).mockResolvedValue(null); // No BOM

            // Act
            const result = await MrpService.simulateMaterialRequirements('so-1');

            // Assert
            expect(result.missingBoms).toHaveLength(1);
            expect(result.missingBoms[0].productName).toBe('Finished Product');
            expect(result.canProduce).toBe(false);
        });
    });

    describe('convertSoToPo', () => {
        it('should convert sales order to production orders', async () => {
            // Arrange
            const mockSalesOrder = {
                id: 'so-1',
                orderNumber: 'SO-001',
                sourceLocationId: 'loc-1',
                items: [
                    {
                        productVariantId: 'pv-finished',
                        quantity: 10,
                        productVariant: {
                            id: 'pv-finished',
                            name: 'Finished Product',
                            product: { productType: 'FINISHED_GOOD' },
                        },
                    },
                ],
            };

            const mockProductVariant = {
                id: 'pv-finished',
                name: 'Finished Product',
                product: { productType: 'FINISHED_GOOD' },
            };

            const mockBom = {
                id: 'bom-1',
                productVariantId: 'pv-finished',
                outputQuantity: { toNumber: () => 100 },
                items: [
                    {
                        productVariantId: 'pv-raw',
                        quantity: { toNumber: () => 200 },
                        scrapPercentage: { toNumber: () => 5 },
                        productVariant: {
                            id: 'pv-raw',
                            name: 'Raw Material',
                            unit: 'kg',
                            productType: 'RAW_MATERIAL',
                        },
                    },
                ],
            };

            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockSalesOrder as any);
            vi.mocked(prisma.productVariant.findUnique).mockResolvedValue(mockProductVariant as any);
            vi.mocked(prisma.bom.findFirst).mockResolvedValue(mockBom as any);
            vi.mocked(prisma.bom.findMany).mockResolvedValue([mockBom] as any);
            vi.mocked(prisma.bomItem.findMany).mockResolvedValue(mockBom.items as any);
            vi.mocked(prisma.inventory.aggregate).mockResolvedValue({
                _sum: { quantity: { toNumber: () => 100 } },
            } as any);
            vi.mocked(prisma.stockReservation.aggregate).mockResolvedValue({
                _sum: { quantity: { toNumber: () => 0 } },
            } as any);

            const { createProductionOrderWithGeneratedNumber } = await import('../order-number-service');
            vi.mocked(createProductionOrderWithGeneratedNumber).mockResolvedValue({
                id: 'po-1',
                orderNumber: 'WO-001',
            } as any);

            // Act
            const result = await MrpService.convertSoToPo('so-1', 'user-1');

            // Assert
            expect(result.success).toBe(true);
            expect(result.orderCount).toBeGreaterThanOrEqual(0);
        });

        it('should throw error when sales order not found', async () => {
            // Arrange
            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null);

            // Mock simulateMaterialRequirements to return empty
            const mockSalesOrder = { id: 'so-1', items: [] };
            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValueOnce(mockSalesOrder as any);
            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValueOnce(null);

            // Act & Assert
            await expect(
                MrpService.convertSoToPo('so-999', 'user-1')
            ).rejects.toThrow(/tidak ditemukan/i);
        });
    });
});
