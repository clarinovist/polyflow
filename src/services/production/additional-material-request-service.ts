import {
    AdditionalMaterialRequestStatus,
    MovementType,
    Prisma,
} from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { ISSUABLE_MATERIAL_TYPES } from '@/lib/constants/products';
import {
    BusinessRuleError,
    NotFoundError,
} from '@/lib/errors/errors';
import type {
    AdditionalMaterialRequestValues,
    ConfirmAdditionalMaterialRequestValues,
    RejectAdditionalMaterialRequestValues,
} from '@/lib/schemas/production';
import { logActivity } from '@/lib/tools/audit';
import { AccountingService } from '@/services/accounting/accounting-service';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { assertTransferMaterialOrder } from './direct-material-service';
import { isEligibleMaterialSourceLocation } from '@/lib/locations/resolve-location';

const REQUESTABLE_ORDER_STATUSES = ['RELEASED', 'IN_PROGRESS'] as const;
const REVIEWABLE_ORDER_STATUSES = [
    ...REQUESTABLE_ORDER_STATUSES,
    'COMPLETED',
] as const;

async function getIssueUnitCost(
    tx: Prisma.TransactionClient,
    locationId: string,
    productVariantId: string,
): Promise<number> {
    const inventory = await tx.inventory.findUnique({
        where: {
            locationId_productVariantId: { locationId, productVariantId },
        },
        select: {
            averageCost: true,
            productVariant: {
                select: { standardCost: true, buyPrice: true, price: true },
            },
        },
    });

    if (
        inventory?.averageCost !== null &&
        inventory?.averageCost !== undefined
    ) {
        return inventory.averageCost.toNumber();
    }

    return Number(
        inventory?.productVariant?.standardCost ??
            inventory?.productVariant?.buyPrice ??
            inventory?.productVariant?.price ??
            0,
    );
}

function assertRequestStillPending(
    status: AdditionalMaterialRequestStatus,
    request: { materialIssueId?: string | null; stockMovementId?: string | null },
) {
    if (
        status === AdditionalMaterialRequestStatus.CONFIRMED &&
        request.materialIssueId &&
        request.stockMovementId
    ) {
        return false;
    }
    if (status !== AdditionalMaterialRequestStatus.PENDING) {
        throw new BusinessRuleError(
            `Permintaan bahan tambahan sudah berstatus ${status}. Segarkan halaman sebelum melanjutkan.`,
            { status },
            'ADDITIONAL_MATERIAL_REQUEST_ALREADY_REVIEWED',
        );
    }
    return true;
}

export class AdditionalMaterialRequestService {
    static async createRequest(data: AdditionalMaterialRequestValues) {
        const existing = await prisma.additionalMaterialRequest.findUnique({
            where: { clientRequestId: data.clientRequestId },
            select: { id: true, status: true },
        });
        if (existing) return { ...existing, idempotent: true };

        const [order, operator, material] = await Promise.all([
            prisma.productionOrder.findUnique({
                where: { id: data.productionOrderId },
                select: {
                    id: true,
                    orderNumber: true,
                    status: true,
                    materialConsumptionMode: true,
                    executions: {
                        where: { endTime: null },
                        select: { id: true, operatorId: true },
                        orderBy: { startTime: 'desc' },
                        take: 1,
                    },
                },
            }),
            prisma.employee.findFirst({
                where: {
                    id: data.operatorId,
                    status: 'ACTIVE',
                    role: 'OPERATOR',
                },
                select: { id: true },
            }),
            prisma.productVariant.findFirst({
                where: {
                    id: data.productVariantId,
                    archivedAt: null,
                    product: {
                        productType: { in: [...ISSUABLE_MATERIAL_TYPES] },
                    },
                },
                select: { id: true },
            }),
        ]);

        if (!order) throw new NotFoundError('ProductionOrder', data.productionOrderId);
        assertTransferMaterialOrder(order);
        if (!REQUESTABLE_ORDER_STATUSES.some((status) => status === order.status)) {
            throw new BusinessRuleError(
                'Bahan tambahan hanya dapat diajukan untuk SPK aktif.',
                { productionOrderId: order.id, status: order.status },
                'ADDITIONAL_MATERIAL_ORDER_NOT_ACTIVE',
            );
        }
        if (!operator) {
            throw new BusinessRuleError(
                'Operator kiosk tidak aktif atau tidak ditemukan.',
                { operatorId: data.operatorId },
                'INVALID_KIOSK_OPERATOR',
            );
        }
        if (!material) {
            throw new BusinessRuleError(
                'Bahan tidak aktif atau bukan material produksi yang dapat dipakai.',
                { productVariantId: data.productVariantId },
                'INVALID_ADDITIONAL_MATERIAL',
            );
        }
        if (order.executions.length === 0) {
            throw new BusinessRuleError(
                'Bahan tambahan hanya dapat diajukan saat SPK sedang berjalan.',
                { productionOrderId: order.id, operatorId: data.operatorId },
                'KIOSK_OPERATOR_ORDER_MISMATCH',
            );
        }

        try {
            const request = await prisma.additionalMaterialRequest.create({
                data: {
                    productionOrderId: data.productionOrderId,
                    productVariantId: data.productVariantId,
                    quantity: data.quantity,
                    reason: data.reason,
                    operatorId: data.operatorId,
                    clientRequestId: data.clientRequestId,
                },
                select: { id: true, status: true },
            });
            return { ...request, idempotent: false };
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002' &&
                Array.isArray(error.meta?.target) &&
                error.meta.target.includes('clientRequestId')
            ) {
                const duplicate =
                    await prisma.additionalMaterialRequest.findUniqueOrThrow({
                        where: { clientRequestId: data.clientRequestId },
                        select: { id: true, status: true },
                    });
                return { ...duplicate, idempotent: true };
            }
            throw error;
        }
    }

    static async confirmRequest(
        data: ConfirmAdditionalMaterialRequestValues & { reviewerId: string },
    ) {
        return prisma.$transaction(async (tx) => {
            const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id"
                FROM "AdditionalMaterialRequest"
                WHERE "id" = ${data.requestId}
                FOR UPDATE
            `;
            if (lockedRows.length === 0) {
                throw new NotFoundError('AdditionalMaterialRequest', data.requestId);
            }

            const request = await tx.additionalMaterialRequest.findUnique({
                where: { id: data.requestId },
                include: {
                    productionOrder: {
                        select: {
                            id: true,
                            orderNumber: true,
                            status: true,
                            materialConsumptionMode: true,
                        },
                    },
                    productVariant: {
                        select: { name: true, primaryUnit: true },
                    },
                },
            });
            if (!request) {
                throw new NotFoundError('AdditionalMaterialRequest', data.requestId);
            }
            if (!assertRequestStillPending(request.status, request)) {
                return {
                    id: request.id,
                    productionOrderId: request.productionOrderId,
                    materialIssueId: request.materialIssueId!,
                    idempotent: true,
                };
            }
            assertTransferMaterialOrder(request.productionOrder);
            if (
                !REVIEWABLE_ORDER_STATUSES.some(
                    (status) => status === request.productionOrder.status,
                )
            ) {
                throw new BusinessRuleError(
                    'SPK dibatalkan atau tidak dapat menerima konfirmasi bahan.',
                    { status: request.productionOrder.status },
                    'ADDITIONAL_MATERIAL_ORDER_NOT_ACTIVE',
                );
            }

            const location = await tx.location.findFirst({
                where: { id: data.sourceLocationId, locationType: 'INTERNAL' },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    locationPurpose: true,
                },
            });
            if (!location || !isEligibleMaterialSourceLocation(location)) {
                throw new BusinessRuleError(
                    'Lokasi sumber tidak ditemukan atau bukan lokasi internal.',
                    { sourceLocationId: data.sourceLocationId },
                    'INVALID_ADDITIONAL_MATERIAL_LOCATION',
                );
            }

            const quantity = Number(request.quantity);
            const unitCost = await getIssueUnitCost(
                tx,
                data.sourceLocationId,
                request.productVariantId,
            );
            await InventoryCoreService.validateAndLockStock(
                tx,
                data.sourceLocationId,
                request.productVariantId,
                quantity,
            );
            await InventoryCoreService.deductStock(
                tx,
                data.sourceLocationId,
                request.productVariantId,
                quantity,
            );

            const movement = await tx.stockMovement.create({
                data: {
                    type: MovementType.OUT,
                    productVariantId: request.productVariantId,
                    fromLocationId: data.sourceLocationId,
                    toLocationId: null,
                    quantity,
                    cost: unitCost,
                    // Dedicated prefix: this is incremental actual usage, not a
                    // replacement for BOM backflush. PROD-ISSUE would make the
                    // backflush guard skip the entire standard quantity.
                    reference: `PROD-ADDITIONAL-${request.productionOrder.orderNumber} REQ:${request.id}`,
                    createdById: data.reviewerId,
                    productionOrderId: request.productionOrderId,
                },
            });
            await AccountingService.recordInventoryMovement(movement, tx);

            const materialIssue = await tx.materialIssue.create({
                data: {
                    productionOrderId: request.productionOrderId,
                    productVariantId: request.productVariantId,
                    quantity,
                    locationId: data.sourceLocationId,
                    createdById: data.reviewerId,
                },
            });

            const reviewedAt = new Date();
            const claimed = await tx.additionalMaterialRequest.updateMany({
                where: {
                    id: request.id,
                    status: AdditionalMaterialRequestStatus.PENDING,
                },
                data: {
                    status: AdditionalMaterialRequestStatus.CONFIRMED,
                    reviewedById: data.reviewerId,
                    reviewedAt,
                    sourceLocationId: data.sourceLocationId,
                    materialIssueId: materialIssue.id,
                    stockMovementId: movement.id,
                    rejectionReason: null,
                },
            });
            if (claimed.count !== 1) {
                throw new BusinessRuleError(
                    'Permintaan sudah diproses oleh pengguna lain. Segarkan halaman.',
                    { requestId: request.id },
                    'STALE_ADDITIONAL_MATERIAL_REQUEST',
                );
            }

            await logActivity({
                userId: data.reviewerId,
                action: 'CONFIRM_ADDITIONAL_MATERIAL_REQUEST',
                entityType: 'AdditionalMaterialRequest',
                entityId: request.id,
                details: `Konfirmasi bahan tambahan untuk ${request.productionOrder.orderNumber}: ${request.productVariant.name} ${quantity} ${request.productVariant.primaryUnit}`,
                changes: {
                    sourceLocationId: data.sourceLocationId,
                    materialIssueId: materialIssue.id,
                    stockMovementId: movement.id,
                },
                fromStatus: 'PENDING',
                toStatus: 'CONFIRMED',
                tx,
            });

            return {
                id: request.id,
                productionOrderId: request.productionOrderId,
                materialIssueId: materialIssue.id,
                idempotent: false,
            };
        });
    }

    static async rejectRequest(
        data: RejectAdditionalMaterialRequestValues & { reviewerId: string },
    ) {
        return prisma.$transaction(async (tx) => {
            const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id"
                FROM "AdditionalMaterialRequest"
                WHERE "id" = ${data.requestId}
                FOR UPDATE
            `;
            if (lockedRows.length === 0) {
                throw new NotFoundError('AdditionalMaterialRequest', data.requestId);
            }

            const request = await tx.additionalMaterialRequest.findUnique({
                where: { id: data.requestId },
                include: {
                    productionOrder: { select: { orderNumber: true } },
                },
            });
            if (!request) {
                throw new NotFoundError('AdditionalMaterialRequest', data.requestId);
            }
            if (!assertRequestStillPending(request.status, request)) {
                throw new BusinessRuleError(
                    'Permintaan yang sudah dikonfirmasi tidak dapat ditolak.',
                    { requestId: request.id },
                    'ADDITIONAL_MATERIAL_REQUEST_ALREADY_CONFIRMED',
                );
            }

            const reviewedAt = new Date();
            const claimed = await tx.additionalMaterialRequest.updateMany({
                where: {
                    id: request.id,
                    status: AdditionalMaterialRequestStatus.PENDING,
                },
                data: {
                    status: AdditionalMaterialRequestStatus.REJECTED,
                    reviewedById: data.reviewerId,
                    reviewedAt,
                    rejectionReason: data.reason,
                    sourceLocationId: null,
                    materialIssueId: null,
                    stockMovementId: null,
                },
            });
            if (claimed.count !== 1) {
                throw new BusinessRuleError(
                    'Permintaan sudah diproses oleh pengguna lain. Segarkan halaman.',
                    { requestId: request.id },
                    'STALE_ADDITIONAL_MATERIAL_REQUEST',
                );
            }

            await logActivity({
                userId: data.reviewerId,
                action: 'REJECT_ADDITIONAL_MATERIAL_REQUEST',
                entityType: 'AdditionalMaterialRequest',
                entityId: request.id,
                details: `Tolak bahan tambahan untuk ${request.productionOrder.orderNumber}: ${data.reason}`,
                fromStatus: 'PENDING',
                toStatus: 'REJECTED',
                tx,
            });
            return {
                id: request.id,
                productionOrderId: request.productionOrderId,
            };
        });
    }

    static async listPendingRequests() {
        return prisma.additionalMaterialRequest.findMany({
            where: {
                status: AdditionalMaterialRequestStatus.PENDING,
            },
            select: {
                id: true,
                productionOrderId: true,
                quantity: true,
                reason: true,
                requestedAt: true,
                productVariant: {
                    select: {
                        id: true,
                        name: true,
                        skuCode: true,
                        primaryUnit: true,
                        product: { select: { productType: true } },
                    },
                },
                operator: { select: { id: true, name: true } },
            },
            orderBy: { requestedAt: 'asc' },
            take: 500,
        });
    }
}
