import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdditionalMaterialRequestStatus } from '@prisma/client';
import { AdditionalMaterialRequestService } from '../additional-material-request-service';
import { prisma } from '@/lib/core/prisma';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { AccountingService } from '@/services/accounting/accounting-service';
import { logActivity } from '@/lib/tools/audit';

vi.mock('@/lib/core/prisma', () => {
    const db = {
        additionalMaterialRequest: {
            findUnique: vi.fn(),
            findUniqueOrThrow: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            updateMany: vi.fn(),
        },
        productionOrder: { findUnique: vi.fn() },
        employee: { findFirst: vi.fn() },
        productVariant: { findFirst: vi.fn() },
        location: { findFirst: vi.fn() },
        inventory: { findUnique: vi.fn() },
        stockMovement: { create: vi.fn() },
        materialIssue: { create: vi.fn(), findMany: vi.fn() },
        $queryRaw: vi.fn(),
        $transaction: vi.fn(),
    };
    db.$transaction.mockImplementation(
        async (callback: (tx: typeof db) => Promise<unknown>) => callback(db),
    );
    return { prisma: db };
});

vi.mock('@/services/inventory/core-service', () => ({
    InventoryCoreService: {
        validateAndLockStock: vi.fn(),
        deductStock: vi.fn(),
    },
}));

vi.mock('@/services/accounting/accounting-service', () => ({
    AccountingService: { recordInventoryMovement: vi.fn() },
}));

vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));

const decimal = (value: number) => ({
    toNumber: () => value,
    toString: () => String(value),
});

const createInput = {
    productionOrderId: 'po-1',
    productVariantId: 'material-1',
    quantity: 2.5,
    reason: 'Campuran terlalu kering',
    operatorId: 'operator-1',
    clientRequestId: '11111111-1111-4111-8111-111111111111',
};

const activeOrder = {
    id: 'po-1',
    orderNumber: 'WO-001',
    status: 'IN_PROGRESS',
    materialConsumptionMode: 'TRANSFER',
    executions: [{ id: 'execution-1', operatorId: 'operator-1' }],
};

const pendingRequest = {
    id: 'request-1',
    productionOrderId: 'po-1',
    productVariantId: 'material-1',
    quantity: decimal(2.5),
    status: AdditionalMaterialRequestStatus.PENDING,
    productionOrder: {
        id: 'po-1',
        orderNumber: 'WO-001',
        status: 'IN_PROGRESS',
        materialConsumptionMode: 'TRANSFER',
    },
    productVariant: {
        name: 'Pelembab',
        primaryUnit: 'KG',
    },
};

describe('AdditionalMaterialRequestService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.$transaction).mockImplementation(
            async (callback: (tx: typeof prisma) => Promise<unknown>) =>
                callback(prisma),
        );
        vi.mocked(prisma.$queryRaw).mockResolvedValue([
            { id: 'request-1' },
        ] as never);
    });

    it('creates a pending kiosk request without changing inventory or HPP', async () => {
        vi.mocked(prisma.additionalMaterialRequest.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue(activeOrder as never);
        vi.mocked(prisma.employee.findFirst).mockResolvedValue({ id: 'operator-1' } as never);
        vi.mocked(prisma.productVariant.findFirst).mockResolvedValue({ id: 'material-1' } as never);
        vi.mocked(prisma.additionalMaterialRequest.create).mockResolvedValue({
            id: 'request-1',
            status: AdditionalMaterialRequestStatus.PENDING,
        } as never);

        const result = await AdditionalMaterialRequestService.createRequest(createInput);

        expect(result).toEqual({
            id: 'request-1',
            status: AdditionalMaterialRequestStatus.PENDING,
            idempotent: false,
        });
        expect(prisma.additionalMaterialRequest.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    operatorId: 'operator-1',
                    reason: 'Campuran terlalu kering',
                }),
            }),
        );
        expect(InventoryCoreService.deductStock).not.toHaveBeenCalled();
        expect(prisma.materialIssue.create).not.toHaveBeenCalled();
        expect(AccountingService.recordInventoryMovement).not.toHaveBeenCalled();
    });

    it('returns the existing request for an idempotent retry', async () => {
        vi.mocked(prisma.additionalMaterialRequest.findUnique).mockResolvedValue({
            id: 'request-existing',
            status: AdditionalMaterialRequestStatus.PENDING,
        } as never);

        const result = await AdditionalMaterialRequestService.createRequest(createInput);

        expect(result.idempotent).toBe(true);
        expect(prisma.productionOrder.findUnique).not.toHaveBeenCalled();
        expect(prisma.additionalMaterialRequest.create).not.toHaveBeenCalled();
    });

    it('accepts an active kiosk operator during an operator handover on the running SPK', async () => {
        vi.mocked(prisma.additionalMaterialRequest.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
            ...activeOrder,
            executions: [{ id: 'execution-1', operatorId: 'operator-other' }],
        } as never);
        vi.mocked(prisma.employee.findFirst).mockResolvedValue({ id: 'operator-1' } as never);
        vi.mocked(prisma.productVariant.findFirst).mockResolvedValue({ id: 'material-1' } as never);
        vi.mocked(prisma.additionalMaterialRequest.create).mockResolvedValue({
            id: 'request-handover',
            status: AdditionalMaterialRequestStatus.PENDING,
        } as never);

        await expect(
            AdditionalMaterialRequestService.createRequest(createInput),
        ).resolves.toMatchObject({ id: 'request-handover' });
    });

    it('rejects a request when the SPK has no running execution', async () => {
        vi.mocked(prisma.additionalMaterialRequest.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
            ...activeOrder,
            executions: [],
        } as never);
        vi.mocked(prisma.employee.findFirst).mockResolvedValue({ id: 'operator-1' } as never);
        vi.mocked(prisma.productVariant.findFirst).mockResolvedValue({ id: 'material-1' } as never);

        await expect(
            AdditionalMaterialRequestService.createRequest(createInput),
        ).rejects.toMatchObject({ code: 'KIOSK_OPERATOR_ORDER_MISMATCH' });
        expect(prisma.additionalMaterialRequest.create).not.toHaveBeenCalled();
    });

    it('confirms atomically and only then creates stock, accounting, and issue records', async () => {
        vi.mocked(prisma.additionalMaterialRequest.findUnique).mockResolvedValue(
            pendingRequest as never,
        );
        vi.mocked(prisma.location.findFirst).mockResolvedValue({
            id: 'rm-1',
            name: 'Gudang Bahan Baku',
            slug: 'rm_warehouse',
            locationPurpose: 'RAW_MATERIAL',
        } as never);
        vi.mocked(prisma.inventory.findUnique).mockResolvedValue({
            averageCost: decimal(12),
        } as never);
        vi.mocked(prisma.stockMovement.create).mockResolvedValue({ id: 'movement-1' } as never);
        vi.mocked(prisma.materialIssue.create).mockResolvedValue({ id: 'issue-1' } as never);
        vi.mocked(prisma.additionalMaterialRequest.updateMany).mockResolvedValue({ count: 1 });

        const result = await AdditionalMaterialRequestService.confirmRequest({
            requestId: 'request-1',
            sourceLocationId: 'rm-1',
            reviewerId: 'warehouse-1',
        });

        expect(result).toEqual({ id: 'request-1', productionOrderId: 'po-1', materialIssueId: 'issue-1' });
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
        expect(InventoryCoreService.validateAndLockStock).toHaveBeenCalledWith(
            prisma,
            'rm-1',
            'material-1',
            2.5,
        );
        expect(InventoryCoreService.deductStock).toHaveBeenCalledWith(
            prisma,
            'rm-1',
            'material-1',
            2.5,
        );
        expect(AccountingService.recordInventoryMovement).toHaveBeenCalledWith(
            { id: 'movement-1' },
            prisma,
        );
        const movementCall =
            vi.mocked(prisma.stockMovement.create).mock.invocationCallOrder[0];
        const journalCall = vi.mocked(
            AccountingService.recordInventoryMovement,
        ).mock.invocationCallOrder[0];
        const issueCall =
            vi.mocked(prisma.materialIssue.create).mock.invocationCallOrder[0];
        expect(movementCall).toBeLessThan(journalCall);
        expect(journalCall).toBeLessThan(issueCall);
        expect(prisma.stockMovement.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    reference:
                        'PROD-ADDITIONAL-WO-001 REQ:request-1',
                }),
            }),
        );
        expect(
            vi.mocked(prisma.stockMovement.create).mock.calls[0][0].data
                .reference,
        ).not.toMatch(/^PROD-ISSUE-/);
        expect(prisma.additionalMaterialRequest.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: 'request-1',
                    status: AdditionalMaterialRequestStatus.PENDING,
                },
                data: expect.objectContaining({
                    status: AdditionalMaterialRequestStatus.CONFIRMED,
                    materialIssueId: 'issue-1',
                    stockMovementId: 'movement-1',
                }),
            }),
        );
        expect(logActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'CONFIRM_ADDITIONAL_MATERIAL_REQUEST',
                fromStatus: 'PENDING',
                toStatus: 'CONFIRMED',
                tx: prisma,
            }),
        );
    });

    it('fails before stock mutation when the request disappeared before the lock', async () => {
        vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

        await expect(
            AdditionalMaterialRequestService.confirmRequest({
                requestId: 'request-missing',
                sourceLocationId: 'rm-1',
                reviewerId: 'warehouse-1',
            }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(InventoryCoreService.deductStock).not.toHaveBeenCalled();
        expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('rolls back by throwing when another reviewer wins the status claim', async () => {
        vi.mocked(prisma.additionalMaterialRequest.findUnique).mockResolvedValue(
            pendingRequest as never,
        );
        vi.mocked(prisma.location.findFirst).mockResolvedValue({
            id: 'rm-1',
            name: 'Gudang Bahan Baku',
            slug: 'rm_warehouse',
            locationPurpose: 'RAW_MATERIAL',
        } as never);
        vi.mocked(prisma.inventory.findUnique).mockResolvedValue({ averageCost: decimal(12) } as never);
        vi.mocked(prisma.stockMovement.create).mockResolvedValue({ id: 'movement-1' } as never);
        vi.mocked(prisma.materialIssue.create).mockResolvedValue({ id: 'issue-1' } as never);
        vi.mocked(prisma.additionalMaterialRequest.updateMany).mockResolvedValue({ count: 0 });

        await expect(
            AdditionalMaterialRequestService.confirmRequest({
                requestId: 'request-1',
                sourceLocationId: 'rm-1',
                reviewerId: 'warehouse-1',
            }),
        ).rejects.toMatchObject({ code: 'STALE_ADDITIONAL_MATERIAL_REQUEST' });
        expect(logActivity).not.toHaveBeenCalled();
    });

    it('allows warehouse confirmation after the operator completed the SPK', async () => {
        vi.mocked(prisma.additionalMaterialRequest.findUnique).mockResolvedValue({
            ...pendingRequest,
            productionOrder: {
                ...pendingRequest.productionOrder,
                status: 'COMPLETED',
            },
        } as never);
        vi.mocked(prisma.location.findFirst).mockResolvedValue({
            id: 'rm-1',
            name: 'Gudang Bahan Baku',
            slug: 'rm_warehouse',
            locationPurpose: 'RAW_MATERIAL',
        } as never);
        vi.mocked(prisma.inventory.findUnique).mockResolvedValue({
            averageCost: decimal(12),
        } as never);
        vi.mocked(prisma.stockMovement.create).mockResolvedValue({ id: 'movement-1' } as never);
        vi.mocked(prisma.materialIssue.create).mockResolvedValue({ id: 'issue-1' } as never);
        vi.mocked(prisma.additionalMaterialRequest.updateMany).mockResolvedValue({ count: 1 });

        await expect(
            AdditionalMaterialRequestService.confirmRequest({
                requestId: 'request-1',
                sourceLocationId: 'rm-1',
                reviewerId: 'warehouse-1',
            }),
        ).resolves.toEqual({ id: 'request-1', productionOrderId: 'po-1', materialIssueId: 'issue-1' });
    });

    it('rejects a pending request without touching stock', async () => {
        vi.mocked(prisma.additionalMaterialRequest.findUnique).mockResolvedValue({
            ...pendingRequest,
            productionOrder: { orderNumber: 'WO-001' },
        } as never);
        vi.mocked(prisma.additionalMaterialRequest.updateMany).mockResolvedValue({ count: 1 });

        await AdditionalMaterialRequestService.rejectRequest({
            requestId: 'request-1',
            reason: 'Bahan tidak sesuai proses',
            reviewerId: 'warehouse-1',
        });

        expect(prisma.additionalMaterialRequest.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: AdditionalMaterialRequestStatus.REJECTED,
                    rejectionReason: 'Bahan tidak sesuai proses',
                }),
            }),
        );
        expect(InventoryCoreService.deductStock).not.toHaveBeenCalled();
        expect(prisma.materialIssue.create).not.toHaveBeenCalled();
        expect(logActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'REJECT_ADDITIONAL_MATERIAL_REQUEST',
                fromStatus: 'PENDING',
                toStatus: 'REJECTED',
            }),
        );
    });
});
