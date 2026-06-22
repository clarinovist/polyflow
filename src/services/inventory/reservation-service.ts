import { prisma } from "@/lib/core/prisma";
import { Prisma, ReservationStatus } from "@prisma/client";
import {
  CreateReservationValues,
  CancelReservationValues,
} from "@/lib/schemas/inventory";

export async function createStockReservation(
  data: CreateReservationValues,
  tx?: Prisma.TransactionClient,
) {
  const {
    productVariantId,
    locationId,
    quantity,
    reservedFor,
    referenceId,
    reservedUntil,
  } = data;

  const execute = async (transaction: Prisma.TransactionClient) => {
    // Lock the inventory row to prevent concurrent over-reservation
    const stockRow = await transaction.$queryRaw<Array<{ quantity: string }>>`
            SELECT "quantity"::text as quantity
            FROM "Inventory"
            WHERE "locationId" = ${locationId} AND "productVariantId" = ${productVariantId}
            FOR UPDATE
        `;
    const totalPhysical = stockRow[0] ? Number(stockRow[0].quantity) : 0;

    const currentReservations = await transaction.stockReservation.aggregate({
      where: {
        locationId,
        productVariantId,
        status: ReservationStatus.ACTIVE,
      },
      _sum: { quantity: true },
    });

    const totalReserved = currentReservations._sum.quantity?.toNumber() || 0;
    const available = totalPhysical - totalReserved;

    const status =
      available >= quantity
        ? ReservationStatus.ACTIVE
        : ReservationStatus.WAITING;

    await transaction.stockReservation.create({
      data: {
        productVariantId,
        locationId,
        quantity,
        reservedFor,
        referenceId,
        reservedUntil,
        status,
      },
    });
  };

  if (tx) {
    await execute(tx);
  } else {
    await prisma.$transaction(execute);
  }
}

export async function cancelStockReservation(data: CancelReservationValues) {
  await prisma.$transaction(async (tx) => {
    // Use conditional updateMany to atomically check status and cancel
    const updated = await tx.stockReservation.updateMany({
      where: {
        id: data.reservationId,
        status: { in: [ReservationStatus.ACTIVE, ReservationStatus.WAITING] },
      },
      data: { status: ReservationStatus.CANCELLED },
    });

    if (updated.count === 0) {
      // Check if reservation exists at all
      const reservation = await tx.stockReservation.findUnique({
        where: { id: data.reservationId },
        select: { status: true },
      });
      if (!reservation) {
        throw new Error("Reservation not found");
      }
      throw new Error(
        `Cannot cancel reservation in ${reservation.status} status. Only ACTIVE or WAITING reservations can be cancelled.`,
      );
    }
  });
}

export async function getActiveReservations(
  locationId?: string,
  productVariantId?: string,
) {
  const where: Prisma.StockReservationWhereInput = {
    status: { in: [ReservationStatus.ACTIVE, ReservationStatus.WAITING] },
  };

  if (locationId) where.locationId = locationId;
  if (productVariantId) where.productVariantId = productVariantId;

  return await prisma.stockReservation.findMany({
    where,
    include: {
      productVariant: {
        select: { name: true, skuCode: true },
      },
      location: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
