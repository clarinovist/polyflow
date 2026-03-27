'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';
import { safeAction } from '@/lib/errors/errors';

export const getDeliveryOrders = withTenant(
async function getDeliveryOrders(dateRange?: { startDate?: Date, endDate?: Date }) {
    return safeAction(async () => {
        const where: Prisma.DeliveryOrderWhereInput = {};
        if (dateRange?.startDate && dateRange?.endDate) {
            where.deliveryDate = {
                gte: dateRange.startDate,
                lte: dateRange.endDate
            };
        }

        const deliveryOrders = await prisma.deliveryOrder.findMany({
            where,
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                salesOrder: {
                    select: {
                        orderNumber: true,
                        customer: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
                sourceLocation: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        return deliveryOrders;
    });
}
);
export const getDeliveryOrderById = withTenant(
async function getDeliveryOrderById(id: string) {
    return safeAction(async () => {
        const deliveryOrder = await prisma.deliveryOrder.findUnique({
            where: { id },
            include: {
                salesOrder: {
                    include: {
                        customer: true,
                    },
                },
                sourceLocation: true,
                items: {
                    include: {
                        productVariant: {
                            include: {
                                product: true,
                            },
                        },
                    },
                },
                createdBy: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        return deliveryOrder;
    });
}
);
