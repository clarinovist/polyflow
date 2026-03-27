import { prisma } from '@/lib/core/prisma';
import { Prisma, ReservationStatus } from '@prisma/client';
import { CreateReservationValues, CancelReservationValues } from '@/lib/schemas/inventory';


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
                status: ReservationStatus.ACTIVE
            },
            _sum: { quantity: true }
        });

        const totalPhysical = physicalStock?.quantity.toNumber() || 0;
        const totalReserved = currentReservations._sum.quantity?.toNumber() || 0;
        const available = totalPhysical - totalReserved;

        const status = (available >= quantity ? ReservationStatus.ACTIVE : ReservationStatus.WAITING);

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
        data: { status: ReservationStatus.CANCELLED }
    });
}

export async function getActiveReservations(locationId?: string, productVariantId?: string) {
    const where: Prisma.StockReservationWhereInput = {
        status: { in: [ReservationStatus.ACTIVE, ReservationStatus.WAITING] }
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
