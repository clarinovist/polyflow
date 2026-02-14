'use server';

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function getDeliveryOrders(dateRange?: { startDate?: Date, endDate?: Date }) {
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
}
export async function getDeliveryOrderById(id: string) {
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
}
