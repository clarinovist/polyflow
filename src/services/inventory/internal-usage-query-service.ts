import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { NotFoundError, ValidationError } from '@/lib/errors/errors';
import { internalUsageFiltersSchema } from '@/lib/schemas/internal-usage';
import { toBusinessDateString } from '@/lib/utils/timezone';
import type {
    InternalUsageFormData,
    InternalUsageHistory,
    InternalUsageRecord,
} from '@/types/internal-usage';

// Exclude cost/account IDs and the actor's user row from all warehouse responses.
export const internalUsageRecordSelect = {
    id: true,
    number: true,
    movementId: true,
    productName: true,
    skuCode: true,
    unit: true,
    locationName: true,
    recipient: true,
    department: true,
    purpose: true,
    recordedByName: true,
    stockBefore: true,
    stockAfter: true,
    createdAt: true,
    movement: { select: { quantity: true } },
} satisfies Prisma.InternalUsageSelect;
type UsageRow = Prisma.InternalUsageGetPayload<{
    select: typeof internalUsageRecordSelect;
}>;
export function serializeInternalUsage(row: UsageRow): InternalUsageRecord {
    const { movement, stockBefore, stockAfter, createdAt, ...rest } = row;
    return {
        id: rest.id,
        number: rest.number,
        movementId: rest.movementId,
        productName: rest.productName,
        skuCode: rest.skuCode,
        unit: rest.unit,
        locationName: rest.locationName,
        recipient: rest.recipient,
        department: rest.department,
        purpose: rest.purpose,
        recordedByName: rest.recordedByName,
        stockBefore: stockBefore.toNumber(),
        stockAfter: stockAfter.toNumber(),
        createdAt: createdAt.toISOString(),
        quantity: movement.quantity.toNumber(),
    };
}

export async function getInternalUsageHistory(
    filters: unknown = {},
): Promise<InternalUsageHistory> {
    const parsed = internalUsageFiltersSchema.safeParse(filters);
    if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0].message);
    const { query, department, page } = parsed.data;
    const where: Prisma.InternalUsageWhereInput = {
        ...(department ? { department } : {}),
        ...(query
            ? {
                  OR: ['number', 'productName', 'skuCode', 'recipient'].map(
                      (field) => ({
                          [field]: { contains: query, mode: 'insensitive' },
                      }),
                  ),
              }
            : {}),
    };
    const pageSize = 25;
    return prisma.$transaction(
        async (tx) => {
            const total = await tx.internalUsage.count({ where });
            const actualPage = Math.min(
                page,
                Math.max(1, Math.ceil(total / pageSize)),
            );
            const rows = await tx.internalUsage.findMany({
                where,
                select: internalUsageRecordSelect,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                skip: (actualPage - 1) * pageSize,
                take: pageSize,
            });
            const departments = await tx.internalUsage.findMany({
                select: { department: true },
                distinct: ['department'],
                orderBy: { department: 'asc' },
                take: 200,
            });
            return {
                records: rows.map(serializeInternalUsage),
                total,
                page: actualPage,
                pageSize,
                query,
                department,
                departments: departments.map((row) => row.department),
            };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}

export async function getInternalUsageDetail(id: string) {
    if (!id || id.length > 100)
        throw new ValidationError('Nomor bukti tidak valid.');
    const row = await prisma.internalUsage.findUnique({
        where: { id },
        select: internalUsageRecordSelect,
    });
    if (!row) throw new NotFoundError('Bukti pemakaian internal', id);
    return serializeInternalUsage(row);
}

export async function getInternalUsageFormData(
    actorId: string,
): Promise<InternalUsageFormData> {
    return prisma.$transaction(
        async (tx) => {
            const [variants, reservations, actor] = await Promise.all([
                tx.productVariant.findMany({
                    where: {
                        archivedAt: null,
                        product: { productType: 'OPERATIONAL' },
                    },
                    select: {
                        id: true,
                        name: true,
                        skuCode: true,
                        primaryUnit: true,
                        inventories: {
                            where: {
                                location: {
                                    locationType: 'INTERNAL',
                                    packagingOwnerCustomerId: null,
                                },
                            },
                            select: {
                                quantity: true,
                                locationId: true,
                                location: { select: { name: true } },
                            },
                        },
                    },
                    orderBy: { name: 'asc' },
                }),
                tx.stockReservation.groupBy({
                    by: ['locationId', 'productVariantId'],
                    where: {
                        status: 'ACTIVE',
                        productVariant: {
                            product: { productType: 'OPERATIONAL' },
                        },
                    },
                    _sum: { quantity: true },
                }),
                tx.user.findUnique({
                    where: { id: actorId },
                    select: { name: true },
                }),
            ]);
            const reserved = new Map(
                reservations.map((row) => [
                    `${row.productVariantId}:${row.locationId}`,
                    row._sum.quantity ?? new Prisma.Decimal(0),
                ]),
            );
            return {
                date: toBusinessDateString(new Date()),
                actorName: actor?.name || 'Petugas Gudang',
                products: variants.map((variant) => ({
                    id: variant.id,
                    name: variant.name,
                    skuCode: variant.skuCode,
                    unit: variant.primaryUnit,
                    stocks: variant.inventories.map((inventory) => {
                        const held =
                            reserved.get(
                                `${variant.id}:${inventory.locationId}`,
                            ) ?? new Prisma.Decimal(0);
                        return {
                            locationId: inventory.locationId,
                            locationName: inventory.location.name,
                            quantity: inventory.quantity.toNumber(),
                            reserved: held.toNumber(),
                            available: Prisma.Decimal.max(
                                0,
                                inventory.quantity.minus(held),
                            ).toNumber(),
                        };
                    }),
                })),
            };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}
