import { describe, it, expect, vi, beforeEach } from 'vitest';
// Imported per module rather than through the production.ts barrel: the barrel
// re-exports nine modules, and pulling all of them in would drag a large
// untested surface into the coverage denominator for no added assurance.
import { logMachineDowntime } from '../production-downtime';
import { simulateMrp } from '../production-mrp';
import {
    updateProductionIssueStatus,
    deleteProductionIssue,
} from '../production-issues';
import {
    recordMaterialIssue,
    deleteMaterialIssue,
    recordScrap,
} from '../production-materials';
import { recordQualityInspection } from '../production-inspection';
import {
    startExecution,
    stopExecution,
    logRunningOutput,
} from '../production-execution';
import { getProductionOrderStats } from '../production-orders';
import { logMachineDowntime as logKioskDowntime } from '../downtime';
import { prisma } from '@/lib/core/prisma';
import { MachineStatus } from '@prisma/client';
import { ProductionService } from '@/services/production/production-service';
import { MrpService } from '@/services/production/mrp-service';
import { auth } from '@/auth';

/**
 * Auth guards on the production server actions.
 *
 * Ported from tests/actions/production-security.test.ts, which sat outside
 * vitest's include glob and had not run since Feb 2026. Its assertions matched
 * /Unauthorized/i, a message this codebase never produces — the real guards
 * either redirect to /login or reject with an Indonesian BusinessRuleError.
 *
 * Not every action is guarded, and that is deliberate: the shop-floor kiosk
 * runs without a NextAuth session. Those exceptions are asserted here too, so
 * the open surface stays a decision rather than an accident.
 */

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

// requireAuth calls redirect('/login'), which in Next.js throws to halt the
// action. The default test stub is a no-op, which would let execution fall
// through into Prisma and hide the guard entirely.
vi.mock('next/navigation', () => ({
    redirect: vi.fn((url: string) => {
        // Shaped like the real thing: safeAction re-throws on the digest, so a
        // plain Error would be swallowed into a failed envelope instead.
        const error = new Error('NEXT_REDIRECT') as Error & { digest: string };
        error.digest = `NEXT_REDIRECT;replace;${url};307;`;
        throw error;
    }),
    notFound: vi.fn(),
}));

// Tenant resolution reads request headers, which do not exist under vitest.
// The guards under test sit inside the wrapper, so an identity wrapper is enough.
vi.mock('@/lib/core/tenant', () => ({
    withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

const kioskTx = {
    machineDowntime: { create: vi.fn() },
    machine: { update: vi.fn() },
};

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: { groupBy: vi.fn(), findUnique: vi.fn() },
        user: { findUnique: vi.fn() },
        $transaction: vi.fn(),
    },
    getMainPrisma: vi.fn(),
    getTenantDb: vi.fn(),
    tenantContext: { getStore: vi.fn(), run: vi.fn() },
}));

vi.mock('@/services/production/production-service', () => ({
    ProductionService: {
        stopExecution: vi.fn(),
        startExecution: vi.fn(),
        logRunningOutput: vi.fn(),
        getActiveExecutions: vi.fn(),
        recordDowntime: vi.fn(),
        updateIssueStatus: vi.fn(),
        deleteIssue: vi.fn(),
        batchIssueMaterials: vi.fn(),
        recordMaterialIssue: vi.fn(),
        deleteMaterialIssue: vi.fn(),
        recordScrap: vi.fn(),
        recordQualityInspection: vi.fn(),
    },
}));

vi.mock('@/services/production/mrp-service', () => ({
    MrpService: {
        simulateMaterialRequirements: vi.fn(),
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: (data: unknown) => data,
}));

vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const asMock = (fn: unknown) => vi.mocked(fn as (...args: never[]) => unknown);

describe('production actions — auth guards', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // No session: the state every guard below is defending against.
        asMock(auth).mockResolvedValue(null);
    });

    describe('guarded actions redirect an anonymous caller to /login', () => {
        it('logMachineDowntime', async () => {
            // Act + Assert
            await expect(
                logMachineDowntime({
                    machineId: 'mac-1',
                    reason: 'Broken',
                    startTime: new Date(),
                }),
            ).rejects.toThrow(/NEXT_REDIRECT/);
            expect(ProductionService.recordDowntime).not.toHaveBeenCalled();
        });

        it('simulateMrp', async () => {
            // Act + Assert
            await expect(
                simulateMrp('so-123'),
            ).rejects.toThrow(/NEXT_REDIRECT/);
            expect(
                MrpService.simulateMaterialRequirements,
            ).not.toHaveBeenCalled();
        });

        it('updateProductionIssueStatus', async () => {
            // Act + Assert
            await expect(
                updateProductionIssueStatus('issue-1', 'RESOLVED'),
            ).rejects.toThrow(/NEXT_REDIRECT/);
            expect(ProductionService.updateIssueStatus).not.toHaveBeenCalled();
        });

        it('deleteProductionIssue', async () => {
            // Act + Assert
            await expect(
                deleteProductionIssue('issue-1', 'po-1'),
            ).rejects.toThrow(/NEXT_REDIRECT/);
            expect(ProductionService.deleteIssue).not.toHaveBeenCalled();
        });

        it('recordMaterialIssue', async () => {
            // Act + Assert
            await expect(
                recordMaterialIssue({
                    productionOrderId: 'po-1',
                    productVariantId: 'pv-1',
                    locationId: 'loc-1',
                    quantity: 10,
                }),
            ).rejects.toThrow(/NEXT_REDIRECT/);
            expect(ProductionService.recordMaterialIssue).not.toHaveBeenCalled();
        });

        it('deleteMaterialIssue', async () => {
            // Act + Assert
            await expect(
                deleteMaterialIssue('issue-1', 'po-1'),
            ).rejects.toThrow(/NEXT_REDIRECT/);
            expect(ProductionService.deleteMaterialIssue).not.toHaveBeenCalled();
        });

        it('recordScrap', async () => {
            // Act + Assert
            await expect(
                recordScrap({
                    productionOrderId: 'po-1',
                    productVariantId: 'pv-1',
                    locationId: 'loc-1',
                    quantity: 5,
                    reason: '',
                }),
            ).rejects.toThrow(/NEXT_REDIRECT/);
            expect(ProductionService.recordScrap).not.toHaveBeenCalled();
        });

        it('recordQualityInspection', async () => {
            // Act + Assert
            await expect(
                recordQualityInspection({
                    productionOrderId: 'po-1',
                    result: 'PASS',
                    notes: '',
                }),
            ).rejects.toThrow(/NEXT_REDIRECT/);
            expect(
                ProductionService.recordQualityInspection,
            ).not.toHaveBeenCalled();
        });
    });

    describe('kiosk-capable execution actions', () => {
        it('startExecution refuses an anonymous caller with no operator id', async () => {
            // Act
            const result = await startExecution({
                productionOrderId: 'po-123',
                machineId: 'mac-123',
                shiftId: 'shift-123',
            } as never);

            // Assert — kiosk fallback needs an operator to attribute work to
            expect(result.success).toBe(false);
            expect(ProductionService.startExecution).not.toHaveBeenCalled();
        });

        it('stopExecution refuses an anonymous caller with no operator id', async () => {
            // Act
            const result = await stopExecution({
                executionId: 'exec-123',
                quantityProduced: 10,
                scrapQuantity: 0,
                scrapProngkolQty: 0,
                scrapDaunQty: 0,
                notes: '',
                completed: true,
            } as never);

            // Assert
            expect(result.success).toBe(false);
            expect(ProductionService.stopExecution).not.toHaveBeenCalled();
        });

        it('logRunningOutput refuses an anonymous caller with no operator id', async () => {
            // Act
            const result = await logRunningOutput({
                executionId: 'exec-123',
                quantityProduced: 5,
                scrapQuantity: 0,
                scrapProngkolQty: 0,
                scrapDaunQty: 0,
                notes: '',
                shiftId: undefined,
            } as never);

            // Assert
            expect(result.success).toBe(false);
            expect(ProductionService.logRunningOutput).not.toHaveBeenCalled();
        });
    });

    describe('kiosk downtime logging', () => {
        // downtime.ts is the kiosk twin of production-downtime.ts. It writes a
        // downtime row and flips the machine to MAINTENANCE, so it must not be
        // callable with neither a session nor an operator to attribute it to.
        beforeEach(() => {
            kioskTx.machineDowntime.create.mockResolvedValue({ id: 'dt-1' });
            kioskTx.machine.update.mockResolvedValue({ id: 'mac-1' });
            asMock(prisma.$transaction).mockImplementation(
                async (fn: unknown) =>
                    (fn as (tx: unknown) => Promise<unknown>)(kioskTx),
            );
        });

        it('refuses an anonymous caller with no operator id', async () => {
            // Act
            const result = await logKioskDowntime('mac-1', 'Rantai putus');

            // Assert
            expect(result.success).toBe(false);
            expect(kioskTx.machineDowntime.create).not.toHaveBeenCalled();
            expect(kioskTx.machine.update).not.toHaveBeenCalled();
        });

        it('accepts an anonymous caller that identifies the operator', async () => {
            // Act
            const result = await logKioskDowntime(
                'mac-1',
                'Rantai putus',
                'op-7',
            );

            // Assert
            expect(result.success).toBe(true);
            expect(kioskTx.machineDowntime.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        machineId: 'mac-1',
                        reason: 'Rantai putus',
                        createdById: 'op-7',
                    }),
                }),
            );
            expect(kioskTx.machine.update).toHaveBeenCalledWith({
                where: { id: 'mac-1' },
                data: { status: MachineStatus.MAINTENANCE },
            });
        });

        it('still rejects a blank reason', async () => {
            // Act
            const result = await logKioskDowntime('mac-1', '', 'op-7');

            // Assert
            expect(result.success).toBe(false);
            expect(kioskTx.machineDowntime.create).not.toHaveBeenCalled();
        });
    });

    describe('deliberately open surface', () => {
        it('getProductionOrderStats degrades to zeros instead of leaking counts', async () => {
            // Act
            const result = await getProductionOrderStats();

            // Assert
            expect(result).toEqual({
                totalOrders: 0,
                activeCount: 0,
                draftCount: 0,
                lateCount: 0,
            });
        });
    });
});
