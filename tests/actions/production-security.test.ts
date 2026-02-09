import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as productionActions from '@/actions/production';
import { ProductionService } from '@/services/production-service';
import { MrpService } from '@/services/mrp-service';
import { auth } from '@/auth';

// Mock auth
vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

// Mock ProductionService
vi.mock('@/services/production-service', () => ({
    ProductionService: {
        stopExecution: vi.fn(),
        startExecution: vi.fn(),
        logRunningOutput: vi.fn(),
        getActiveExecutions: vi.fn(),
        recordDowntime: vi.fn(),
        getBomWithInventory: vi.fn(),
        createIssue: vi.fn(),
        updateIssueStatus: vi.fn(),
        deleteIssue: vi.fn(),
        batchIssueMaterials: vi.fn(),
        recordMaterialIssue: vi.fn(),
        deleteMaterialIssue: vi.fn(),
        recordScrap: vi.fn(),
        recordQualityInspection: vi.fn(),
    },
}));

// Mock MrpService
vi.mock('@/services/mrp-service', () => ({
    MrpService: {
        simulateMaterialRequirements: vi.fn(),
    },
}));

// Mock revalidatePath
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

// Mock serializeData
vi.mock('@/lib/utils', () => ({
    serializeData: (data: unknown) => data,
}));


describe('Production Actions Security', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('stopExecution', () => {
        it('should prevent access when unauthenticated', async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const result = await productionActions.stopExecution({
                executionId: 'exec-123',
                quantityProduced: 10,
                scrapQuantity: 0,
                completed: true,
            });
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/Unauthorized/i);
            expect(ProductionService.stopExecution).not.toHaveBeenCalled();
        });
    });

    describe('startExecution', () => {
        it('should prevent access when unauthenticated', async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const result = await productionActions.startExecution({
                productionOrderId: 'po-123',
                machineId: 'mac-123',
                operatorId: 'op-123',
                shiftId: 'shift-123'
            });
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/Unauthorized/i);
            expect(ProductionService.startExecution).not.toHaveBeenCalled();
        });
    });

    describe('logRunningOutput', () => {
        it('should prevent access when unauthenticated', async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const result = await productionActions.logRunningOutput({
                executionId: 'exec-123',
                quantityProduced: 5,
                scrapQuantity: 0
            });
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/Unauthorized/i);
            expect(ProductionService.logRunningOutput).not.toHaveBeenCalled();
        });
    });

    describe('getActiveExecutions', () => {
        it('should return empty array when unauthenticated', async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const result = await productionActions.getActiveExecutions();
            expect(result).toEqual([]);
            expect(ProductionService.getActiveExecutions).not.toHaveBeenCalled();
        });
    });

    describe('logMachineDowntime', () => {
        it('should prevent access when unauthenticated', async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const result = await productionActions.logMachineDowntime({
                machineId: 'mac-1',
                reason: 'Broken',
                startTime: new Date()
            });
            expect(result.success).toBe(false);
            expect(ProductionService.recordDowntime).not.toHaveBeenCalled();
        });
    });

    describe('simulateMrp', () => {
        it('should prevent access when unauthenticated', async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const result = await productionActions.simulateMrp('so-123');
            expect(result.success).toBe(false);
            expect(MrpService.simulateMaterialRequirements).not.toHaveBeenCalled();
        });
    });

    describe('updateProductionIssueStatus', () => {
        it('should prevent access when unauthenticated', async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const result = await productionActions.updateProductionIssueStatus('issue-1', 'RESOLVED');
            expect(result.success).toBe(false);
            expect(ProductionService.updateIssueStatus).not.toHaveBeenCalled();
        });
    });

    describe('deleteProductionIssue', () => {
        it('should prevent access when unauthenticated', async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const result = await productionActions.deleteProductionIssue('issue-1', 'po-1');
            expect(result.success).toBe(false);
            expect(ProductionService.deleteIssue).not.toHaveBeenCalled();
        });
    });

    describe('batchIssueMaterials', () => {
        it('should prevent access when unauthenticated', async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const result = await productionActions.batchIssueMaterials({
                productionOrderId: 'po-1',
                locationId: 'loc-1',
                items: []
            });
            expect(result.success).toBe(false);
            expect(ProductionService.batchIssueMaterials).not.toHaveBeenCalled();
        });
    });

    describe('recordMaterialIssue', () => {
        it('should prevent access when unauthenticated', async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const result = await productionActions.recordMaterialIssue({
                productionOrderId: 'po-1',
                productVariantId: 'pv-1',
                locationId: 'loc-1',
                quantity: 10
            });
            expect(result.success).toBe(false);
            expect(ProductionService.recordMaterialIssue).not.toHaveBeenCalled();
        });
    });

    describe('deleteMaterialIssue', () => {
        it('should prevent access when unauthenticated', async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const result = await productionActions.deleteMaterialIssue('issue-1', 'po-1');
            expect(result.success).toBe(false);
            expect(ProductionService.deleteMaterialIssue).not.toHaveBeenCalled();
        });
    });

    describe('recordScrap', () => {
        it('should prevent access when unauthenticated', async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const result = await productionActions.recordScrap({
                productionOrderId: 'po-1',
                productVariantId: 'pv-1',
                locationId: 'loc-1',
                quantity: 5
            });
            expect(result.success).toBe(false);
            expect(ProductionService.recordScrap).not.toHaveBeenCalled();
        });
    });

    describe('recordQualityInspection', () => {
        it('should prevent access when unauthenticated', async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const result = await productionActions.recordQualityInspection({
                productionOrderId: 'po-1',
                result: 'PASS'
            });
            expect(result.success).toBe(false);
            expect(ProductionService.recordQualityInspection).not.toHaveBeenCalled();
        });
    });

    describe('getProductionOrderStats', () => {
        it('should return empty/zeros when unauthenticated', async () => {
            (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            // We need to mock prisma for this one as it calls prisma directly
            // But the function is in production.ts, so we can test the auth check logic before prisma call?
            // No, auth check comes first. If we return early, prisma is not called.
            // But if I didn't mock prisma, it might crash.
            // Wait, I am mocking production-service but this function uses `prisma` directly!

            // I need to mock prisma for this test file or the test will fail if it proceeds to prisma call.
            // But if my fix works, it won't proceed.
            // So if it fails with "prisma is not mocked" or similar (or connection error), then vulnerability exists.
            // If it returns zeros, it's fixed.

            const result = await productionActions.getProductionOrderStats();
            expect(result).toEqual({ totalOrders: 0, activeCount: 0, draftCount: 0, lateCount: 0 });
        });
    });
});
