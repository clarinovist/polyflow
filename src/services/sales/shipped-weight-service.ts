import { Prisma, type DeliveryStatus } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';

// A shipment remains part of gross outbound volume after a physical return.
// Reversed shipments become CANCELLED and must not contribute.
const SHIPPED_STATUSES: DeliveryStatus[] = [
    'SHIPPED',
    'IN_TRANSIT',
    'ARRIVED',
    'DELIVERED',
    'RETURNED',
];
const physicalProduct = {
    product: { productType: { not: 'SERVICE' as const } },
};

export interface ShippedWeightStats {
    shippedWeightKg: number;
    shippedOrderCount: number;
    unconvertedItemCount: number;
    incompleteOrderCount: number;
}

/** Read inside the caller's authenticated tenant context. Scope is SO orderDate, not DO date. */
export async function getShippedWeightStats(
    orderScope: Prisma.SalesOrderWhereInput,
): Promise<ShippedWeightStats> {
    const orders = await prisma.salesOrder.findMany({
        where: {
            AND: [orderScope, { status: { not: 'CANCELLED' } }],
            items: { some: { productVariant: physicalProduct } },
            OR: [
                { status: { in: ['SHIPPED', 'DELIVERED'] } },
                { items: { some: { deliveredQty: { gt: 0 } } } },
                {
                    deliveryOrders: {
                        some: { status: { in: SHIPPED_STATUSES } },
                    },
                },
            ],
        },
        select: {
            status: true,
            items: {
                where: { productVariant: physicalProduct },
                select: {
                    productVariantId: true,
                    quantity: true,
                    deliveredQty: true,
                },
            },
            deliveryOrders: {
                // Historical shipments predate stockCommittedAt/verifiedQuantity.
                // Their status and final base quantity remain the source of truth.
                where: { status: { in: SHIPPED_STATUSES } },
                select: {
                    items: {
                        where: { productVariant: physicalProduct },
                        select: {
                            productVariantId: true,
                            quantity: true,
                            enteredUnit: true,
                            conversionFactorSnapshot: true,
                            productVariant: { select: { primaryUnit: true } },
                        },
                    },
                },
            },
        },
    });

    let weight = new Prisma.Decimal(0);
    let shippedOrderCount = 0;
    let unconvertedItemCount = 0;
    let incompleteOrderCount = 0;
    for (const order of orders) {
        const documented = new Map<string, Prisma.Decimal>();
        let contributesWeight = false;
        for (const delivery of order.deliveryOrders) {
            for (const item of delivery.items) {
                const quantity = item.quantity;
                if (!quantity.isFinite() || quantity.isNegative()) {
                    unconvertedItemCount++;
                    continue;
                }
                if (quantity.isZero()) continue;
                documented.set(
                    item.productVariantId,
                    (
                        documented.get(item.productVariantId) ??
                        new Prisma.Decimal(0)
                    ).plus(quantity),
                );
                const factor = item.conversionFactorSnapshot;
                // quantity is ALREADY normalized to primaryUnit. Never multiply it again.
                if (item.productVariant.primaryUnit === 'KG') {
                    weight = weight.plus(quantity);
                } else if (
                    item.enteredUnit === 'KG' &&
                    factor?.isFinite() &&
                    factor.gt(0)
                ) {
                    // Historical primary units per entered KG, not today's master conversion.
                    weight = weight.plus(quantity.div(factor));
                } else {
                    unconvertedItemCount++;
                    continue;
                }
                contributesWeight = true;
            }
        }
        if (contributesWeight) shippedOrderCount++;

        // Detect missing legacy shipment detail without inventing kg from ordered qty.
        // Group duplicate SO variants before comparing against their DO quantities.
        const expected = new Map<string, Prisma.Decimal>();
        const completed =
            order.status === 'SHIPPED' || order.status === 'DELIVERED';
        for (const item of order.items) {
            const quantity = completed
                ? Prisma.Decimal.max(item.quantity, item.deliveredQty)
                : item.deliveredQty;
            expected.set(
                item.productVariantId,
                (
                    expected.get(item.productVariantId) ?? new Prisma.Decimal(0)
                ).plus(quantity),
            );
        }
        if (
            [...expected].some(([variantId, quantity]) =>
                quantity.minus(documented.get(variantId) ?? 0).gt('0.0001'),
            )
        )
            incompleteOrderCount++;
    }

    return {
        shippedWeightKg: weight.toNumber(),
        shippedOrderCount,
        unconvertedItemCount,
        incompleteOrderCount,
    };
}
