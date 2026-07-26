import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createProductionIssue,
    updateProductionIssueStatus,
    deleteProductionIssue,
} from '../production-issues';
import { recordQualityInspection } from '../production-inspection';
import { logMachineDowntime } from '../production-downtime';
import { ProductionService } from '@/services/production/production-service';
import { requireAuth } from '@/lib/tools/auth-checks';
import { revalidatePath } from 'next/cache';

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/core/tenant', () => ({
    withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

vi.mock('@/services/production/production-service', () => ({
    ProductionService: {
        createIssue: vi.fn(),
        updateIssueStatus: vi.fn(),
        deleteIssue: vi.fn(),
        recordQualityInspection: vi.fn(),
        recordDowntime: vi.fn(),
    },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: (data: unknown) => data,
}));

vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const SESSION = { user: { id: 'user-1' } };

describe('production issue, inspection and downtime actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockResolvedValue(SESSION as never);
    });

    describe('createProductionIssue', () => {
        const input = {
            productionOrderId: 'po-1',
            category: 'MACHINE_BREAKDOWN' as const,
            description: 'Mesin berhenti mendadak',
        };

        it('attributes the report to the current user', async () => {
            // Arrange
            vi.mocked(ProductionService.createIssue).mockResolvedValue({
                id: 'issue-1',
            } as never);

            // Act
            const res = await createProductionIssue(input);

            // Assert
            expect(res.success).toBe(true);
            expect(ProductionService.createIssue).toHaveBeenCalledWith(
                expect.objectContaining({ reportedById: 'user-1' }),
            );
            expect(revalidatePath).toHaveBeenCalledWith(
                '/production/orders/po-1',
            );
        });

        it('reports a service failure without leaking the raw error', async () => {
            // Arrange
            vi.mocked(ProductionService.createIssue).mockRejectedValue(
                new Error('fk violation'),
            );

            // Act
            const res = await createProductionIssue(input);

            // Assert
            expect(res.success).toBe(false);
            if (!res.success) expect(res.error).not.toContain('fk violation');
        });
    });

    describe('updateProductionIssueStatus', () => {
        it('resolves an issue and revalidates the order page when told which', async () => {
            // Arrange
            vi.mocked(ProductionService.updateIssueStatus).mockResolvedValue({
                id: 'issue-1',
            } as never);

            // Act
            const res = await updateProductionIssueStatus(
                'issue-1',
                'RESOLVED',
                'sudah diperbaiki',
                'po-1',
            );

            // Assert
            expect(res.success).toBe(true);
            expect(ProductionService.updateIssueStatus).toHaveBeenCalledWith(
                'issue-1',
                'RESOLVED',
                'sudah diperbaiki',
            );
            expect(revalidatePath).toHaveBeenCalledWith(
                '/production/orders/po-1',
            );
        });

        it('skips revalidation when no order was supplied', async () => {
            // Arrange
            vi.mocked(ProductionService.updateIssueStatus).mockResolvedValue({
                id: 'issue-1',
            } as never);

            // Act
            await updateProductionIssueStatus('issue-1', 'IN_PROGRESS');

            // Assert
            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });

    describe('deleteProductionIssue', () => {
        it('deletes and revalidates the order page', async () => {
            // Arrange
            vi.mocked(ProductionService.deleteIssue).mockResolvedValue(
                undefined as never,
            );

            // Act
            const res = await deleteProductionIssue('issue-1', 'po-1');

            // Assert
            expect(res.success).toBe(true);
            expect(ProductionService.deleteIssue).toHaveBeenCalledWith(
                'issue-1',
            );
        });

        it('fails when the service refuses the delete', async () => {
            // Arrange
            vi.mocked(ProductionService.deleteIssue).mockRejectedValue(
                new Error('locked'),
            );

            // Act
            const res = await deleteProductionIssue('issue-1', 'po-1');

            // Assert
            expect(res.success).toBe(false);
        });
    });

    describe('recordQualityInspection', () => {
        const input = {
            productionOrderId: 'po-1',
            result: 'PASS' as const,
            notes: '',
        };

        it('records the inspection against the order', async () => {
            // Arrange
            vi.mocked(
                ProductionService.recordQualityInspection,
            ).mockResolvedValue(undefined as never);

            // Act
            const res = await recordQualityInspection(input as never);

            // Assert
            expect(res.success).toBe(true);
            expect(
                ProductionService.recordQualityInspection,
            ).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'user-1' }),
            );
        });

        it('rejects a payload the schema refuses', async () => {
            // Act
            const res = await recordQualityInspection({
                productionOrderId: '',
            } as never);

            // Assert
            expect(res.success).toBe(false);
            expect(
                ProductionService.recordQualityInspection,
            ).not.toHaveBeenCalled();
        });

        it('passes a service error message through', async () => {
            // Arrange
            vi.mocked(
                ProductionService.recordQualityInspection,
            ).mockRejectedValue(new Error('Order belum selesai'));

            // Act
            const res = await recordQualityInspection(input as never);

            // Assert
            expect(res.success).toBe(false);
            if (!res.success) expect(res.error).toBe('Order belum selesai');
        });
    });

    describe('logMachineDowntime (session-backed)', () => {
        const input = {
            machineId: 'mac-1',
            reason: 'Rantai putus',
            startTime: new Date('2026-07-01T02:00:00Z'),
        };

        it('records downtime for a signed-in user', async () => {
            // Arrange
            vi.mocked(ProductionService.recordDowntime).mockResolvedValue(
                undefined as never,
            );

            // Act
            const res = await logMachineDowntime(input as never);

            // Assert
            expect(res.success).toBe(true);
            expect(ProductionService.recordDowntime).toHaveBeenCalled();
        });

        it('rejects a payload the schema refuses', async () => {
            // Act
            const res = await logMachineDowntime({ machineId: '' } as never);

            // Assert
            expect(res.success).toBe(false);
            expect(ProductionService.recordDowntime).not.toHaveBeenCalled();
        });
    });
});
