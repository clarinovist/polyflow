import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { InventoryCoreService } from '@/services/inventory/core-service';

export class MaklonReturnService {
    static async createReturn(data: {
        returnNumber: string;
        customerId: string;
        sourceLocationId: string;
        reason?: string;
        notes?: string;
        createdById?: string;
        items: {
            productVariantId: string;
            quantity: number;
            notes?: string;
        }[];
    }, tx?: Prisma.TransactionClient) {
        const execute = async (t: Prisma.TransactionClient) => {
            // 1. Create Return Record
            const ret = await t.maklonMaterialReturn.create({
                data: {
                    returnNumber: data.returnNumber,
                    customerId: data.customerId,
                    sourceLocationId: data.sourceLocationId,
                    reason: data.reason,
                    notes: data.notes,
                    createdById: data.createdById,
                    status: 'COMPLETED',
                    items: {
                        create: data.items.map((item) => ({
                            productVariantId: item.productVariantId,
                            quantity: item.quantity,
                            notes: item.notes
                        }))
                    }
                },
                include: { items: true }
            });

            // 2. Adjust Inventory & Create Movements
            for (const item of data.items) {
                await InventoryCoreService.validateAndLockStock(
                    t,
                    data.sourceLocationId,
                    item.productVariantId,
                    item.quantity
                );

                await InventoryCoreService.deductStock(
                    t,
                    data.sourceLocationId,
                    item.productVariantId,
                    item.quantity
                );

                await t.stockMovement.create({
                    data: {
                        type: 'OUT',
                        productVariantId: item.productVariantId,
                        fromLocationId: data.sourceLocationId,
                        quantity: item.quantity,
                        cost: 0, // Cost is 0 because it's maklon material
                        reference: `MRT-${ret.returnNumber}${ret.notes ? ` - ${ret.notes}` : ''}`,
                        createdById: data.createdById
                    }
                });
            }

            return ret;
        };

        if (tx) return execute(tx);
        return await prisma.$transaction(execute);
    }

    static async getReturns(params?: {
        search?: string;
        status?: string;
        startDate?: Date;
        endDate?: Date;
    }) {
        const where: Prisma.MaklonMaterialReturnWhereInput = {};

        if (params?.search) {
            where.OR = [
                { returnNumber: { contains: params.search, mode: 'insensitive' } },
                { customer: { name: { contains: params.search, mode: 'insensitive' } } }
            ];
        }

        if (params?.status) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            where.status = params.status as any;
        }

        if (params?.startDate && params?.endDate) {
            where.returnDate = {
                gte: params.startDate,
                lte: params.endDate
            };
        }

        return await prisma.maklonMaterialReturn.findMany({
            where,
            include: {
                customer: true,
                sourceLocation: true,
                items: {
                    include: {
                        productVariant: {
                            include: {
                                product: true
                            }
                        }
                    }
                }
            },
            orderBy: { returnDate: 'desc' }
        });
    }

    static async getReturnById(id: string) {
        return await prisma.maklonMaterialReturn.findUnique({
            where: { id },
            include: {
                customer: true,
                sourceLocation: true,
                createdBy: {
                    select: { name: true }
                },
                items: {
                    include: {
                        productVariant: {
                            include: {
                                product: true
                            }
                        }
                    }
                }
            }
        });
    }
}
