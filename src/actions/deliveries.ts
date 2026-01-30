'use server';

import { prisma } from '@/lib/prisma';

export async function getDeliveryOrders() {
    const deliveryOrders = await prisma.deliveryOrder.findMany({
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
