import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { ValidationError } from '@/lib/errors/errors';
import {
    getWibDayBounds,
    parseBusinessDate,
    toBusinessDateString,
} from '@/lib/utils/timezone';
import type {
    StockBalanceData,
    StockBalanceFilters,
} from '@/types/stock-balance';

/** Quantity-only ledger recap. Call inside a tenant/authenticated boundary. */
export async function getStockBalance(
    filters: StockBalanceFilters = {},
): Promise<StockBalanceData> {
    const today = toBusinessDateString(new Date());
    const startDate = filters.startDate ?? `${today.slice(0, 7)}-01`;
    const endDate = filters.endDate ?? today;
    try {
        parseBusinessDate(startDate);
        parseBusinessDate(endDate);
    } catch {
        throw new ValidationError(
            'Tanggal tidak valid. Gunakan format YYYY-MM-DD.',
        );
    }
    if (startDate > endDate) {
        throw new ValidationError(
            'Tanggal awal tidak boleh setelah tanggal akhir.',
        );
    }
    const start = getWibDayBounds(startDate).startOfDay;
    const endExclusive = new Date(
        getWibDayBounds(endDate).endOfDay.getTime() + 1,
    );
    const locationId = filters.locationId?.trim() || '';

    // All aggregates and product metadata see one snapshot, even during stock posting.
    return prisma.$transaction(
        async (tx) => {
            const locations = await tx.location.findMany({
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            });
            if (
                locationId &&
                !locations.some((location) => location.id === locationId)
            ) {
                throw new ValidationError('Gudang/lokasi tidak ditemukan.');
            }

            // Do not filter archived variants: their historical balances still matter.
            const products = await tx.productVariant.findMany({
                where: {
                    product: { productType: { not: 'FIXED_ASSET' } },
                    ...(locationId
                        ? {
                              OR: [
                                  { inventories: { some: { locationId } } },
                                  {
                                      movements: {
                                          some: {
                                              createdAt: { lt: endExclusive },
                                              OR: [
                                                  {
                                                      fromLocationId:
                                                          locationId,
                                                  },
                                                  { toLocationId: locationId },
                                              ],
                                          },
                                      },
                                  },
                              ],
                          }
                        : {}),
                },
                select: {
                    id: true,
                    skuCode: true,
                    name: true,
                    primaryUnit: true,
                },
                orderBy: { skuCode: 'asc' },
            });

            const inbound: Prisma.StockMovementWhereInput = locationId
                ? {
                      toLocationId: locationId,
                      OR: [
                          { fromLocationId: null },
                          { fromLocationId: { not: locationId } },
                      ],
                  }
                : { toLocationId: { not: null }, fromLocationId: null };
            const outbound: Prisma.StockMovementWhereInput = locationId
                ? {
                      fromLocationId: locationId,
                      OR: [
                          { toLocationId: null },
                          { toLocationId: { not: locationId } },
                      ],
                  }
                : { fromLocationId: { not: null }, toLocationId: null };

            // Four bulk queries, regardless of number of SKUs or historical movements.
            const aggregate = async (
                direction: Prisma.StockMovementWhereInput,
                createdAt: Prisma.DateTimeFilter,
            ) => {
                const groups = await tx.stockMovement.groupBy({
                    by: ['productVariantId'],
                    where: {
                        ...direction,
                        createdAt,
                        productVariant: {
                            product: { productType: { not: 'FIXED_ASSET' } },
                        },
                    },
                    _sum: { quantity: true },
                });
                return new Map(
                    groups.map((group) => [
                        group.productVariantId,
                        group._sum.quantity ?? new Prisma.Decimal(0),
                    ]),
                );
            };
            const [priorIn, priorOut, periodIn, periodOut] = await Promise.all([
                aggregate(inbound, { lt: start }),
                aggregate(outbound, { lt: start }),
                aggregate(inbound, { gte: start, lt: endExclusive }),
                aggregate(outbound, { gte: start, lt: endExclusive }),
            ]);
            const zero = new Prisma.Decimal(0);
            return {
                startDate,
                endDate,
                locationId,
                locations,
                rows: products.map((product) => {
                    const opening = (priorIn.get(product.id) ?? zero).minus(
                        priorOut.get(product.id) ?? zero,
                    );
                    const incoming = periodIn.get(product.id) ?? zero;
                    const outgoing = periodOut.get(product.id) ?? zero;
                    return {
                        productVariantId: product.id,
                        skuCode: product.skuCode,
                        name: product.name,
                        unit: product.primaryUnit,
                        openingStock: opening.toNumber(),
                        totalIn: incoming.toNumber(),
                        totalOut: outgoing.toNumber(),
                        closingStock: opening
                            .plus(incoming)
                            .minus(outgoing)
                            .toNumber(),
                    };
                }),
            };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}
