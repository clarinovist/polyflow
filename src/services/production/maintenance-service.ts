import { MaintenanceStatus, MovementType, Prisma } from '@prisma/client';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { AccountingService } from '@/services/accounting/accounting-service';
import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import type { CreateMaintenanceRequestValues } from '@/lib/schemas/maintenance';
import { logActivity } from '@/lib/tools/audit';
import { toBusinessDateString } from '@/lib/utils/timezone';

async function buildOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const datePart = toBusinessDateString(new Date()).slice(2).replace(/-/g, '');
    const dailyPrefix = 'MT-' + datePart + '-';
    const last = await tx.maintenanceRequest.findFirst({
        where: { orderNumber: { startsWith: dailyPrefix } },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
    });
    let next = 1;
    if (last?.orderNumber) {
        const parsed = Number.parseInt(
            last.orderNumber.slice(dailyPrefix.length),
            10,
        );
        if (!Number.isNaN(parsed)) next = parsed + 1;
    }
    return dailyPrefix + String(next).padStart(3, '0');
}

export class MaintenanceService {
    static async create(data: CreateMaintenanceRequestValues, userId: string) {
        const existing = await prisma.maintenanceRequest.findUnique({
            where: { clientRequestId: data.clientRequestId },
            select: { id: true, status: true, orderNumber: true },
        });
        if (existing) return { ...existing, idempotent: true };

        return prisma.$transaction(async (tx) => {
            const orderNumber = await buildOrderNumber(tx);
            const created = await tx.maintenanceRequest.create({
                data: {
                    orderNumber,
                    machineId: data.machineId,
                    complaint: data.complaint,
                    urgency: data.urgency,
                    machineStopped: data.machineStopped ?? false,
                    createdById: userId,
                    status: MaintenanceStatus.DRAFT,
                    clientRequestId: data.clientRequestId,
                    spareParts: {
                        create: data.spareParts.map((part) => ({
                            name: part.name,
                            spec: part.spec,
                            quantity: part.quantity,
                            note: part.note,
                            productVariantId: part.productVariantId,
                            sourceLocationId: part.sourceLocationId,
                        })),
                    },
                },
                include: { spareParts: true },
            });
            await logActivity({
                userId,
                action: 'CREATE_MAINTENANCE',
                entityType: 'MaintenanceRequest',
                entityId: created.id,
                details: 'Buat ' + orderNumber,
                toStatus: 'DRAFT',
                tx,
            });
            return { ...created, idempotent: false };
        });
    }

    static async submit(id: string, userId: string) {
        return prisma.$transaction(async (tx) => {
            const draft = await tx.maintenanceRequest.findUnique({
                where: { id },
                select: { status: true, createdById: true },
            });
            if (!draft) throw new NotFoundError('Maintenance Request', id);
            if (draft.createdById !== userId) {
                throw new BusinessRuleError(
                    'Hanya pembuat laporan yang dapat mengirim draft ini.',
                    { id },
                    'MAINTENANCE_DRAFT_OWNER_REQUIRED',
                );
            }
            const { count } = await tx.maintenanceRequest.updateMany({
                where: {
                    id,
                    status: MaintenanceStatus.DRAFT,
                    createdById: userId,
                },
                data: { status: MaintenanceStatus.PENDING },
            });
            if (count !== 1) {
                throw new BusinessRuleError(
                    'Hanya draft yang bisa dikirim.',
                    { id },
                    'INVALID_MAINTENANCE_STATUS',
                );
            }
            await logActivity({
                userId,
                action: 'SUBMIT_MAINTENANCE',
                entityType: 'MaintenanceRequest',
                entityId: id,
                fromStatus: 'DRAFT',
                toStatus: 'PENDING',
                tx,
            });
            return tx.maintenanceRequest.findUniqueOrThrow({
                where: { id },
                include: { spareParts: true },
            });
        });
    }

    static async approve(id: string, actorId: string, assigneeId: string) {
        return prisma.$transaction(async (tx) => {
            const [current, assignee] = await Promise.all([
                tx.maintenanceRequest.findUnique({
                    where: { id },
                    select: {
                        status: true,
                        machineId: true,
                        machineStopped: true,
                    },
                }),
                // Re-read the assignee inside the same transaction as the
                // approval so an account disabled after the form loaded cannot
                // be assigned by a stale request.
                tx.user.findFirst({
                    where: {
                        id: assigneeId,
                        isActive: true,
                        OR: [
                            { role: { in: ['PRODUCTION', 'ADMIN'] } },
                            {
                                roles: {
                                    some: {
                                        role: {
                                            in: ['PRODUCTION', 'ADMIN'],
                                        },
                                    },
                                },
                            },
                        ],
                    },
                    select: { id: true, name: true, email: true },
                }),
            ]);
            if (!current) throw new NotFoundError('Maintenance Request', id);
            if (!assignee) {
                throw new BusinessRuleError(
                    'Teknisi tidak aktif atau tidak memiliki akses operasional maintenance.',
                    { assigneeId },
                    'INVALID_MAINTENANCE_ASSIGNEE',
                );
            }
            const assigneeName = assignee.name?.trim() || assignee.email;
            if (current.status !== MaintenanceStatus.PENDING) {
                throw new BusinessRuleError(
                    'Hanya laporan menunggu persetujuan yang bisa disetujui. Muat ulang halaman.',
                    { id },
                    'STALE_STATUS',
                );
            }
            let downtimeId: string | undefined;
            if (current.machineStopped) {
                const downtime = await tx.machineDowntime.create({
                    data: {
                        machineId: current.machineId,
                        reason: 'Maintenance ' + id,
                        startTime: new Date(),
                        createdById: actorId,
                    },
                    select: { id: true },
                });
                downtimeId = downtime.id;
            }
            const { count } = await tx.maintenanceRequest.updateMany({
                where: { id, status: MaintenanceStatus.PENDING },
                data: {
                    status: MaintenanceStatus.APPROVED,
                    approvedById: actorId,
                    approvedAt: new Date(),
                    rejectionReason: null,
                    assigneeId: assignee.id,
                    assigneeName,
                    downtimeId,
                },
            });
            if (count !== 1) {
                throw new BusinessRuleError(
                    'Status berubah, silakan muat ulang halaman.',
                    { id },
                    'STALE_STATUS',
                );
            }
            const updated = await tx.maintenanceRequest.findUniqueOrThrow({
                where: { id },
                include: { spareParts: true },
            });
            await logActivity({
                userId: actorId,
                action: 'APPROVE_MAINTENANCE',
                entityType: 'MaintenanceRequest',
                entityId: id,
                details: 'Setujui ' + updated.orderNumber + ' · Teknisi ' + assigneeName,
                fromStatus: 'PENDING',
                toStatus: 'APPROVED',
                tx,
            });
            return updated;
        });
    }

    static async reject(id: string, actorId: string, reason: string) {
        const trimmed = reason.trim();
        if (!trimmed) {
            throw new BusinessRuleError(
                'Alasan penolakan wajib diisi.',
                {},
                'REJECTION_REASON_REQUIRED',
            );
        }
        return prisma.$transaction(async (tx) => {
            const { count } = await tx.maintenanceRequest.updateMany({
                where: { id, status: MaintenanceStatus.PENDING },
                data: {
                    status: MaintenanceStatus.REJECTED,
                    approvedById: actorId,
                    approvedAt: new Date(),
                    rejectionReason: trimmed,
                },
            });
            if (count !== 1) {
                throw new BusinessRuleError(
                    'Hanya laporan menunggu persetujuan yang bisa ditolak.',
                    { id },
                    'STALE_STATUS',
                );
            }
            await logActivity({
                userId: actorId,
                action: 'REJECT_MAINTENANCE',
                entityType: 'MaintenanceRequest',
                entityId: id,
                fromStatus: 'PENDING',
                toStatus: 'REJECTED',
                tx,
            });
            return tx.maintenanceRequest.findUniqueOrThrow({
                where: { id },
                include: { spareParts: true },
            });
        });
    }

    static async start(id: string, actorId: string) {
        return prisma.$transaction(async (tx) => {
            const { count } = await tx.maintenanceRequest.updateMany({
                where: { id, status: MaintenanceStatus.APPROVED },
                data: { status: MaintenanceStatus.IN_PROGRESS },
            });
            if (count !== 1) {
                throw new BusinessRuleError(
                    'Hanya pekerjaan yang sudah disetujui yang bisa dimulai.',
                    { id },
                    'STALE_STATUS',
                );
            }
            await logActivity({
                userId: actorId,
                action: 'START_MAINTENANCE',
                entityType: 'MaintenanceRequest',
                entityId: id,
                fromStatus: 'APPROVED',
                toStatus: 'IN_PROGRESS',
                tx,
            });
            return tx.maintenanceRequest.findUniqueOrThrow({
                where: { id },
                include: { spareParts: true },
            });
        });
    }

    static async complete(
        id: string,
        actorId: string,
        note: string,
        fulfilledIds: string[],
    ) {
        const trimmed = note.trim();
        if (!trimmed) {
            throw new BusinessRuleError(
                'Catatan hasil wajib diisi.',
                {},
                'COMPLETION_NOTE_REQUIRED',
            );
        }
        return prisma.$transaction(async (tx) => {
            const current = await tx.maintenanceRequest.findUnique({
                where: { id },
                select: { status: true, downtimeId: true },
            });
            if (!current) throw new NotFoundError('Maintenance Request', id);
            if (current.status !== MaintenanceStatus.IN_PROGRESS) {
                throw new BusinessRuleError(
                    'Hanya pekerjaan yang sedang dikerjakan yang bisa diselesaikan.',
                    { id },
                    'STALE_STATUS',
                );
            }
            const needs = await tx.maintenanceSparePartNeed.findMany({
                where: { maintenanceRequestId: id },
            });
            const order = await tx.maintenanceRequest.findUniqueOrThrow({
                where: { id },
                select: { orderNumber: true },
            });
            for (const need of needs.filter(
                (item) => fulfilledIds.includes(item.id) && item.productVariantId,
            )) {
                const quantity = Number(need.quantity);
                let locationId = need.sourceLocationId;
                if (!locationId) {
                    const candidates = await tx.inventory.findMany({
                        where: {
                            productVariantId: need.productVariantId as string,
                            quantity: { gte: quantity },
                        },
                        orderBy: { location: { name: 'asc' } },
                        select: { locationId: true },
                        take: 1,
                    });
                    locationId = candidates[0]?.locationId;
                    if (!locationId) {
                        throw new BusinessRuleError(
                            'Stok ' + need.name + ' tidak mencukupi. Catat stok masuk atau lepas centang part.',
                            { needId: need.id },
                            'INSUFFICIENT_SPAREPART_STOCK',
                        );
                    }
                }
                await InventoryCoreService.validateAndLockStock(
                    tx,
                    locationId,
                    need.productVariantId as string,
                    quantity,
                );
                const inventory = await tx.inventory.findUnique({
                    where: {
                        locationId_productVariantId: {
                            locationId,
                            productVariantId: need.productVariantId as string,
                        },
                    },
                    select: { averageCost: true },
                });
                const unitCost = inventory?.averageCost
                    ? Number(inventory.averageCost)
                    : 0;
                await InventoryCoreService.deductStock(
                    tx,
                    locationId,
                    need.productVariantId as string,
                    quantity,
                );
                const movement = await tx.stockMovement.create({
                    data: {
                        type: MovementType.OUT,
                        productVariantId: need.productVariantId as string,
                        fromLocationId: locationId,
                        toLocationId: null,
                        quantity,
                        cost: unitCost,
                        reference: 'MAINT-' + order.orderNumber + ' NEED:' + need.id,
                        createdById: actorId,
                    },
                });
                await AccountingService.recordInventoryMovement(movement, tx);
            }
            if (fulfilledIds.length) {
                await tx.maintenanceSparePartNeed.updateMany({
                    where: {
                        id: { in: fulfilledIds },
                        maintenanceRequestId: id,
                    },
                    data: { fulfilled: true },
                });
            }
            if (current.downtimeId) {
                await tx.machineDowntime.updateMany({
                    where: { id: current.downtimeId, endTime: null },
                    data: { endTime: new Date() },
                });
            }
            const { count } = await tx.maintenanceRequest.updateMany({
                where: { id, status: MaintenanceStatus.IN_PROGRESS },
                data: {
                    status: MaintenanceStatus.DONE,
                    completionNote: trimmed,
                    completedAt: new Date(),
                },
            });
            if (count !== 1) {
                throw new BusinessRuleError(
                    'Status berubah, silakan muat ulang halaman.',
                    { id },
                    'STALE_STATUS',
                );
            }
            await logActivity({
                userId: actorId,
                action: 'COMPLETE_MAINTENANCE',
                entityType: 'MaintenanceRequest',
                entityId: id,
                fromStatus: 'IN_PROGRESS',
                toStatus: 'DONE',
                tx,
            });
            return tx.maintenanceRequest.findUniqueOrThrow({
                where: { id },
                include: { spareParts: true },
            });
        });
    }

    static async getById(id: string) {
        const row = await prisma.maintenanceRequest.findUnique({
            where: { id },
            include: {
                spareParts: true,
                machine: { select: { id: true, name: true, code: true } },
                createdBy: { select: { id: true, name: true } },
                approvedBy: { select: { id: true, name: true } },
                assignee: { select: { id: true, name: true } },
            },
        });
        if (!row) throw new NotFoundError('Maintenance Request', id);
        return row;
    }
}
