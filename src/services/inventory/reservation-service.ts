import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { CreateReservationValues, CancelReservationValues } from '@/lib/schemas/inventory';
import { STATUS_ACTIVE, STATUS_CANCELLED, STATUS_WAITING } from './constants';

export async function createStockReservation(data: CreateReservationValues, tx?: Prisma.TransactionClient) {
    const { productVariantId, locationId, quantity, reservedFor, referenceId, reservedUntil } = data;

    const execute = async (transaction: Prisma.TransactionClient) => {
        const physicalStock = await transaction.inventory.findUnique({
            where: {
                locationId_productVariantId: { locationId, productVariantId }
            },
            select: { quantity: true }
        });

        const currentReservations = await transaction.stockReservation.aggregate({
            where: {
                locationId,
                productVariantId,
                status: STATUS_ACTIVE
            },
            _sum: { quantity: true }
        });

        const totalPhysical = physicalStock?.quantity.toNumber() || 0;
        const totalReserved = currentReservations._sum.quantity?.toNumber() || 0;
        const available = totalPhysical - totalReserved;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = (available >= quantity ? STATUS_ACTIVE : STATUS_WAITING) as any;

        await transaction.stockReservation.create({
            data: {
                productVariantId,
                locationId,
                quantity,
                reservedFor,
                referenceId,
                reservedUntil,
                status
            }
        });
    };

    if (tx) {
        await execute(tx);
    } else {
        await prisma.$transaction(execute);
    }
}

export async function cancelStockReservation(data: CancelReservationValues) {
    await prisma.stockReservation.update({
        where: { id: data.reservationId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { status: STATUS_CANCELLED as any }
    });
}

export async function getActiveReservations(locationId?: string, productVariantId?: string) {
    const where: Prisma.StockReservationWhereInput = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: { in: [STATUS_ACTIVE, STATUS_WAITING] as any }
    };

    if (locationId) where.locationId = locationId;
    if (productVariantId) where.productVariantId = productVariantId;

    return await prisma.stockReservation.findMany({
        where,
        include: {
            productVariant: {
                select: { name: true, skuCode: true }
            },
            location: {
                select: { name: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
}
