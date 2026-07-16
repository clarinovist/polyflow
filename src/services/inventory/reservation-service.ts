import { prisma } from "@/lib/core/prisma";
import { Prisma, ReservationStatus, ReservationType } from "@prisma/client";
import {
  CreateReservationValues,
  CancelReservationValues,
} from "@/lib/schemas/inventory";
import { BusinessRuleError, NotFoundError } from "@/lib/errors/errors";

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

    return await transaction.stockReservation.create({
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
    return await execute(tx);
  } else {
    return await prisma.$transaction(execute);
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
        throw new NotFoundError("Stock Reservation", data.reservationId);
      }
      throw new BusinessRuleError(
        `Cannot cancel reservation in ${reservation.status} status. Only ACTIVE or WAITING reservations can be cancelled.`,
        { status: reservation.status, reservationId: data.reservationId },
        "INVALID_RESERVATION_STATUS",
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

export async function getSalesOrderResidualDemand(
  soId: string,
  productVariantId: string,
  tx: Prisma.TransactionClient,
): Promise<number> {
  const soItem = await tx.salesOrderItem.findFirst({
    where: {
      salesOrderId: soId,
      productVariantId,
    },
    select: {
      quantity: true,
      deliveredQty: true,
    },
  });

  if (!soItem) {
    return 0;
  }

  const orderedQty = soItem.quantity.toNumber();
  const deliveredQty = soItem.deliveredQty.toNumber();

  const reservations = await tx.stockReservation.aggregate({
    where: {
      reservedFor: ReservationType.SALES_ORDER,
      referenceId: soId,
      productVariantId,
      status: { in: [ReservationStatus.ACTIVE, ReservationStatus.WAITING] },
    },
    _sum: {
      quantity: true,
    },
  });

  const reservedQty = reservations._sum.quantity?.toNumber() || 0;
  return Math.max(0, orderedQty - deliveredQty - reservedQty);
}

export async function adjustReservationsForVoidOutput(
  soId: string,
  productVariantId: string,
  locationId: string,
  quantityToVoid: number,
  tx: Prisma.TransactionClient,
) {
  if (quantityToVoid <= 0) return;

  const reservations = await tx.stockReservation.findMany({
    where: {
      reservedFor: ReservationType.SALES_ORDER,
      referenceId: soId,
      productVariantId,
      locationId,
      status: { in: [ReservationStatus.ACTIVE, ReservationStatus.WAITING] },
    },
    orderBy: { createdAt: "desc" },
  });

  let remainingToVoid = quantityToVoid;

  for (const reservation of reservations) {
    if (remainingToVoid <= 0) break;

    const resQty = reservation.quantity.toNumber();
    if (resQty <= remainingToVoid) {
      await tx.stockReservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.CANCELLED },
      });
      remainingToVoid -= resQty;
    } else {
      await tx.stockReservation.update({
        where: { id: reservation.id },
        data: {
          quantity: new Prisma.Decimal(resQty - remainingToVoid),
        },
      });
      remainingToVoid = 0;
    }
  }
}

export async function cancelSpecificReservation(
  reservationId: string,
  tx: Prisma.TransactionClient,
) {
  const reservation = await tx.stockReservation.findUnique({
    where: { id: reservationId },
  });
  if (
    reservation &&
    (reservation.status === ReservationStatus.ACTIVE ||
      reservation.status === ReservationStatus.WAITING)
  ) {
    await tx.stockReservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.CANCELLED },
    });
  }
}
