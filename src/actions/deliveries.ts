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
