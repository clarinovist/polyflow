import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductionService } from '../production/production-service';
import { prisma } from '@/lib/core/prisma';
import { InventoryService } from '../inventory/inventory-service';
import { ProductionCostService } from '../production/cost-service';
import { AccountingService } from '../accounting/accounting-service';
/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../inventory-service');
vi.mock('../production/cost-service');
vi.mock('../accounting-service');
vi.mock('../finance/auto-journal-service');

describe('ProductionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Standard Prisma mocks for finding and updating orders
        ((prisma as any).productionOrder.findUnique as any).mockResolvedValue({
            id: 'po-1',
            status: 'RELEASED',
            plannedQuantity: 100,
            actualQuantity: 0,
            locationId: 'loc-1',
            orderNumber: 'WO-001',
            bom: {
                productVariantId: 'pv-fg',
                outputQuantity: 100,
                category: 'GENERAL',
                items: [
                    { productVariantId: 'pv-mat1', quantity: 50 }
                ]
            },
            plannedMaterials: []
        });

        ((prisma as any).productionOrder.findUniqueOrThrow as any).mockResolvedValue({
            id: 'po-1',
            status: 'RELEASED',
            plannedQuantity: 100,
            actualQuantity: 0,
            locationId: 'loc-1',
            orderNumber: 'WO-001',
            bom: {
                productVariantId: 'pv-fg',
                outputQuantity: 100,
                category: 'GENERAL',
                items: [
                    { productVariantId: 'pv-mat1', quantity: 50 },
                    { productVariantId: 'pv-mat2', quantity: 20 }
                ]
            },
            plannedMaterials: []
        });

        ((prisma as any).productionOrder.update as any).mockImplementation(({ data }: any) => {
            return Promise.resolve({
                id: 'po-1',
                orderNumber: 'WO-001',
                status: data.status || 'IN_PROGRESS',
                locationId: 'loc-1',
                bom: { productVariantId: 'pv-fg', outputQuantity: 100, category: 'GENERAL', items: [{ productVariantId: 'pv-mat1', quantity: 50 }] },
                plannedMaterials: []
            });
        });

        ((prisma as any).productionExecution.create as any).mockResolvedValue({
            id: 'exec-1',
            productionOrderId: 'po-1'
        });

        ((prisma as any).productionExecution.update as any).mockResolvedValue({
            id: 'exec-1',
            productionOrderId: 'po-1'
        });

        ((prisma as any).inventory.upsert as any).mockResolvedValue({ id: 'inv-1', quantity: 10 });
        ((prisma as any).inventory.findUnique as any).mockResolvedValue({ id: 'inv-1', quantity: { toNumber: () => 10 }, averageCost: { toNumber: () => 100 } });
        ((prisma as any).inventory.update as any).mockResolvedValue({});
        ((prisma as any).stockMovement.create as any).mockResolvedValue({ id: 'sm-1' });
        ((prisma as any).materialIssue.create as any).mockResolvedValue({ id: 'mi-1' });
        ((prisma as any).scrapRecord.create as any).mockResolvedValue({ id: 'scrap-1' });
        ((prisma as any).location.findUnique as any).mockResolvedValue({ id: 'loc-scrap' });
        ((prisma as any).productVariant.findUnique as any).mockResolvedValue({ id: 'pv-scrap', skuCode: 'SCRAP-PRONGKOL' });

        (ProductionCostService.calculateBatchCOGM as any).mockResolvedValue(500);
        (AccountingService.recordInventoryMovement as any).mockResolvedValue(undefined);
    });

    describe('State Transitions', () => {
        it('should change order status to IN_PROGRESS on startExecution', async () => {
            await ProductionService.startExecution({
                productionOrderId: 'po-1',
                machineId: 'mach-1',
                operatorId: 'op-1',
                shiftId: 'shift-1'
            });

            expect(prisma.productionExecution.create).toHaveBeenCalled();
            expect(prisma.productionOrder.update).toHaveBeenCalledWith({
                where: { id: 'po-1' },
                data: { status: 'IN_PROGRESS' }
            });
        });

        it('should change order status to COMPLETED on stopExecution with completed=true', async () => {
            await ProductionService.stopExecution({
                executionId: 'exec-1',
                quantityProduced: 20,
                scrapQuantity: 0,
                completed: true,
                notes: 'Finished early'
            });

            const updateOrderCall = ((prisma as any).productionOrder.update as any).mock.calls.find((call: any) => call[0].where.id === 'po-1');
            expect(updateOrderCall).toBeDefined();
            expect(updateOrderCall[0].data.status).toBe('COMPLETED');
            expect(updateOrderCall[0].data.actualQuantity).toBe(20);
        });
    });

    describe('Backflush Material Consumption', () => {
        it('should automatically deduct materials proportionally based on BOM when output is added', async () => {
            await ProductionService.addProductionOutput({
                productionOrderId: 'po-1',
                quantityProduced: 10,
                scrapQuantity: 0,
                scrapProngkolQty: 0,
                scrapDaunQty: 0,
                startTime: new Date(),
                endTime: new Date(),
                notes: 'Partial batch testing'
            });

            // For an output of 10, ratio = 10 / 100 = 0.1
            // BOM Item 1 quantity = 50 -> 50 * 0.1 = 5
            expect((InventoryService.deductStock as any)).toHaveBeenCalledWith(
                expect.anything(),
                'loc-1',
                'pv-mat1',
                5
            );
            
            // Should create stock movement IN for FG
            const stockMovementCalls = ((prisma as any).stockMovement.create as any).mock.calls;
            const fgMovementIn = stockMovementCalls.find((call: any) => call[0].data.productVariantId === 'pv-fg' && call[0].data.type === 'IN');
            
            expect(fgMovementIn).toBeDefined();
            expect(fgMovementIn[0].data.quantity).toBe(10);
            
            // Should record account movements
            expect(AccountingService.recordInventoryMovement).toHaveBeenCalled();
        });
    });

    describe('Scrap Recording & GL Impact', () => {
        it('should automatically record scrap details and adjust inventory when scrap components are logged', async () => {
            await ProductionService.addProductionOutput({
                productionOrderId: 'po-1',
                quantityProduced: 10,
                scrapQuantity: 5,
                scrapProngkolQty: 2,
                scrapDaunQty: 3,
                startTime: new Date(),
                endTime: new Date(),
                notes: ''
            });

            // Scrap consumes materials too. Total consumed = 10 (produced) + 5 (scrap) + 2 (prongkol) + 3 (daun) = 20
            // Ratio = 20 / 100 = 0.2
            // BOM Item 1 quantity = 50 -> 50 * 0.2 = 10
            expect((InventoryService.deductStock as any)).toHaveBeenCalledWith(
                expect.anything(),
                'loc-1',
                'pv-mat1',
                10
            );

            // Expect scrapRecord to be created since prongkol and daun qty is > 0
            expect(prisma.scrapRecord.create).toHaveBeenCalled();
            const scrapCalls = ((prisma as any).scrapRecord.create as any).mock.calls;
            expect(scrapCalls).toHaveLength(2); // One for prongkol, one for daun

            // Make sure the system recorded stock movement for scrap IN
            const smCalls = ((prisma as any).stockMovement.create as any).mock.calls;
            const scrapMovementCreated = smCalls.find((c: any) => 
                c[0].data.reference?.includes('Production Scrap')
            );
            expect(scrapMovementCreated).toBeDefined();
        });
    });
});
