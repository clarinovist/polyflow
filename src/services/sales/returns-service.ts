import { prisma, getTenantDbFromContext } from '@/lib/core/prisma';
import {
    CreateSalesReturnValues,
    UpdateSalesReturnValues,
} from '@/lib/schemas/returns';
import { SalesReturnStatus } from '@prisma/client';
import { format } from 'date-fns';
import { logActivity } from '@/lib/tools/audit';
import {
    receiveSalesReturn,
    type ReturnSourceSelection,
} from './return-receiving-service';
import { transitionSalesReturn } from './return-status-service';
import {
    BusinessRuleError,
    NotFoundError,
    ValidationError,
} from '@/lib/errors/errors';

export class SalesReturnService {
    static async generateReturnNumber(): Promise<string> {
        const dateStr = format(new Date(), 'yyyyMMdd');
        const prefix = `SR-${dateStr}-`;

        const lastReturn = await prisma.salesReturn.findFirst({
            where: { returnNumber: { startsWith: prefix } },
            orderBy: { returnNumber: 'desc' },
        });

        let nextSequence = 1;
        if (lastReturn) {
            const parts = lastReturn.returnNumber.split('-');
            const lastSeq = parseInt(parts[2]);
            if (!isNaN(lastSeq)) {
                nextSequence = lastSeq + 1;
            }
        }

        return `${prefix}${nextSequence.toString().padStart(4, '0')}`;
    }

    static async createReturn(data: CreateSalesReturnValues, userId: string) {
        const returnNumber = await this.generateReturnNumber();

        let totalAmount = 0;
        for (const item of data.items) {
            totalAmount += item.returnedQty * item.unitPrice;
        }

        const salesReturn = await prisma.salesReturn.create({
            data: {
                returnNumber,
                salesOrderId: data.salesOrderId,
                deliveryOrderId: data.deliveryOrderId,
                customerId: data.customerId,
                returnLocationId: data.returnLocationId,
                reason: data.reason,
                notes: data.notes,
                totalAmount,
                status: SalesReturnStatus.DRAFT,
                createdById: userId,
                items: {
                    create: data.items.map((item) => ({
                        productVariantId: item.productVariantId,
                        returnedQty: item.returnedQty,
                        unitPrice: item.unitPrice,
                        reason: item.reason,
                        condition: item.condition,
                        notes: item.notes,
                    })),
                },
            },
            include: {
                items: true,
            },
        });

        await logActivity({
            userId,
            action: 'CREATE_SALES_RETURN',
            entityType: 'SalesReturn',
            entityId: salesReturn.id,
            details: `Created draft Sales Return ${returnNumber}`,
        });

        return salesReturn;
    }

    static async updateReturn(data: UpdateSalesReturnValues, userId: string) {
        if (!data.id) throw new ValidationError('ID retur wajib diisi');
        const db = getTenantDbFromContext();
        if (!db)
            throw new BusinessRuleError(
                'Konteks tenant wajib untuk mengubah retur.',
            );
        return db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "SalesReturn" WHERE id = ${data.id} FOR UPDATE`;
            const existing = await tx.salesReturn.findUnique({
                where: { id: data.id },
            });
            if (!existing) throw new NotFoundError('Sales Return', data.id);
            if (existing.status !== 'DRAFT')
                throw new BusinessRuleError(
                    'Can only update DRAFT returns',
                    { status: existing.status, returnId: data.id },
                    'INVALID_RETURN_STATUS',
                );

            let totalAmount = existing.totalAmount
                ? Number(existing.totalAmount)
                : 0;

            const updateData: Record<string, unknown> = {
                salesOrderId: data.salesOrderId,
                deliveryOrderId: data.deliveryOrderId,
                customerId: data.customerId,
                returnLocationId: data.returnLocationId,
                reason: data.reason,
                notes: data.notes,
            };

            if (data.items) {
                totalAmount = data.items.reduce(
                    (sum, item) => sum + item.returnedQty * item.unitPrice,
                    0,
                );
                updateData.totalAmount = totalAmount;
                updateData.items = {
                    deleteMany: {},
                    create: data.items.map((item) => ({
                        productVariantId: item.productVariantId,
                        returnedQty: item.returnedQty,
                        unitPrice: item.unitPrice,
                        reason: item.reason,
                        condition: item.condition,
                        notes: item.notes,
                    })),
                };
            }

            const salesReturn = await tx.salesReturn.update({
                where: { id: data.id },
                data: updateData,
            });

            await logActivity({
                userId,
                action: 'UPDATE_SALES_RETURN',
                entityType: 'SalesReturn',
                entityId: salesReturn.id,
                details: `Updated Sales Return ${salesReturn.returnNumber}`,
                tx,
            });

            return salesReturn;
        });
    }

    static async confirmReturn(id: string, userId: string) {
        return transitionSalesReturn(id, userId, 'CONFIRMED');
    }

    static async receiveReturn(
        id: string,
        userId: string,
        selections?: ReturnSourceSelection,
    ) {
        return receiveSalesReturn(id, userId, selections);
    }

    static async completeReturn(id: string, userId: string) {
        return transitionSalesReturn(id, userId, 'COMPLETED');
    }

    static async cancelReturn(id: string, userId: string) {
        return transitionSalesReturn(id, userId, 'CANCELLED');
    }

    static async getReturns(filters?: {
        status?: SalesReturnStatus;
        customerId?: string;
        search?: string;
        startDate?: Date;
        endDate?: Date;
    }) {
        const where: Record<string, unknown> = {};
        if (filters?.status) where.status = filters.status;
        if (filters?.customerId) where.customerId = filters.customerId;
        if (filters?.startDate && filters?.endDate) {
            (where as { returnDate?: { gte: Date; lte: Date } }).returnDate = {
                gte: filters.startDate,
                lte: filters.endDate,
            };
        }
        if (filters?.search) {
            where.OR = [
                {
                    returnNumber: {
                        contains: filters.search,
                        mode: 'insensitive',
                    },
                },
                {
                    salesOrder: {
                        orderNumber: {
                            contains: filters.search,
                            mode: 'insensitive',
                        },
                    },
                },
            ];
        }

        return prisma.salesReturn.findMany({
            where,
            include: {
                customer: true,
                salesOrder: { select: { orderNumber: true } },
                _count: { select: { items: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    static async getReturnById(id: string) {
        return prisma.salesReturn.findUnique({
            where: { id },
            include: {
                customer: true,
                salesOrder: true,
                deliveryOrder: true,
                returnLocation: true,
                createdBy: { select: { name: true } },
                items: {
                    include: {
                        productVariant: {
                            include: { product: true },
                        },
                    },
                },
            },
        });
    }
}
