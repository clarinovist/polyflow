'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { OpnameStatus, Prisma, Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import {
    safeAction,
    BusinessRuleError,
    NotFoundError,
    AuthenticationError,
} from '@/lib/errors/errors';
import { auth } from '@/auth';
import { requireRole } from '@/lib/tools/auth-checks';
import { StockOpnameService } from '@/services/inventory/stock-opname-service';
import { toDecimalNumber } from '@/lib/utils/utils';

const MAX_NOTES_LENGTH = 500;
const MAX_REMARKS_LENGTH = 500;
const MAX_LABEL_LENGTH = 100;
const MAX_ENTRIES_PER_ITEM = 500;

function revalidateOpnamePaths(opnameId?: string) {
    revalidatePath('/warehouse/opname');
    revalidatePath('/warehouse/mobile/opname');
    if (opnameId) {
        revalidatePath(`/warehouse/opname/${opnameId}`);
        revalidatePath(`/warehouse/mobile/opname/${opnameId}`);
    }
}

export const getOpnameSessions = withTenant(async function getOpnameSessions() {
    return safeAction(async () => {
        return await prisma.stockOpname.findMany({
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                location: true,
                createdBy: true,
                items: {
                    select: {
                        id: true,
                        countedQuantity: true,
                    },
                },
            },
        });
    });
});

export const getOpnameSession = withTenant(async function getOpnameSession(
    id: string,
) {
    return safeAction(async () => {
        const session = await prisma.stockOpname.findUnique({
            where: { id },
            include: {
                location: true,
                createdBy: true,
                items: {
                    include: {
                        productVariant: {
                            include: {
                                product: true,
                            },
                        },
                        entries: {
                            select: {
                                id: true,
                                quantity: true,
                                label: true,
                                createdAt: true,
                            },
                            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                        },
                    },
                    orderBy: {
                        productVariant: {
                            name: 'asc',
                        },
                    },
                },
            },
        });

        if (!session) {
            throw new NotFoundError('StockOpname', id);
        }

        return session;
    });
});

async function generateOpnameNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    // Format: OPN-YYYYMM-XXXX
    const prefix = `OPN-${year}${month}-`;

    const lastOpname = await prisma.stockOpname.findFirst({
        where: { opnameNumber: { startsWith: prefix } },
        orderBy: { opnameNumber: 'desc' },
        select: { opnameNumber: true },
    });

    let nextSeq = 1;
    if (lastOpname?.opnameNumber) {
        const parts = lastOpname.opnameNumber.split('-');
        const lastSeqStr = parts[parts.length - 1];
        const lastSeq = parseInt(lastSeqStr, 10);

        if (!isNaN(lastSeq)) {
            nextSeq = lastSeq + 1;
        }
    }

    return `${prefix}${nextSeq.toString().padStart(4, '0')}`;
}

export const createOpnameSession = withTenant(
    async function createOpnameSession(locationId: string, remarks?: string) {
        return safeAction(async () => {
            const session = await requireRole([
                Role.WAREHOUSE,
                Role.PRODUCTION,
                Role.PLANNING,
            ]);

            if (!locationId || typeof locationId !== 'string') {
                throw new BusinessRuleError('Lokasi harus dipilih');
            }
            if (remarks && remarks.length > MAX_REMARKS_LENGTH) {
                throw new BusinessRuleError(`Remarks maksimal ${MAX_REMARKS_LENGTH} karakter`);
            }

            // Pre-check: Don't allow multiple OPEN sessions for the same location
            const existingOpenSession = await prisma.stockOpname.findFirst({
                where: {
                    locationId,
                    status: OpnameStatus.OPEN,
                },
                select: { id: true, opnameNumber: true },
            });

            if (existingOpenSession) {
                throw new BusinessRuleError(
                    `Lokasi ini sudah memiliki sesi Stock Opname aktif (${existingOpenSession.opnameNumber || existingOpenSession.id}). Selesaikan atau batalkan sesi tersebut terlebih dahulu.`,
                );
            }

            // 1. Get all inventories for this location to snapshot
            const inventories = await prisma.inventory.findMany({
                where: {
                    locationId: locationId,
                },
            });

            if (inventories.length === 0) {
                throw new BusinessRuleError(
                    'Tidak ada inventori di lokasi ini untuk dilakukan stock opname.',
                );
            }

            // 2. Generate Number
            const opnameNumber = await generateOpnameNumber();

            // 3. Create Session with audit trail
            try {
                const opnameSession = await prisma.stockOpname.create({
                    data: {
                        opnameNumber,
                        locationId,
                        remarks,
                        status: OpnameStatus.OPEN,
                        createdById: session.user.id,
                        items: {
                            create: inventories.map((inv) => ({
                                productVariantId: inv.productVariantId,
                                systemQuantity: inv.quantity,
                                countedQuantity: null,
                            })),
                        },
                    },
                });

                revalidateOpnamePaths();
                return { id: opnameSession.id };
            } catch (error) {
                if (
                    error instanceof Prisma.PrismaClientKnownRequestError &&
                    error.code === 'P2002'
                ) {
                    throw new BusinessRuleError(
                        'Lokasi ini sudah memiliki sesi Stock Opname yang sedang aktif.',
                    );
                }
                throw error;
            }
        });
    },
);

export const addOpnameEntry = withTenant(async function addOpnameEntry(
    opnameItemId: string,
    quantity: number,
    label?: string,
) {
    return safeAction(async () => {
        if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new BusinessRuleError('Jumlah harus lebih dari 0');
        }

        if (label && label.length > MAX_LABEL_LENGTH) {
            throw new BusinessRuleError(`Label maksimal ${MAX_LABEL_LENGTH} karakter`);
        }

        const authSession = await requireRole([
            Role.WAREHOUSE,
            Role.PRODUCTION,
            Role.PLANNING,
        ]);

        const result = await prisma.$transaction(async (tx) => {
            const opnameItem = await tx.stockOpnameItem.findUnique({
                where: { id: opnameItemId },
                include: {
                    opname: {
                        select: { status: true },
                    },
                },
            });

            if (!opnameItem) {
                throw new NotFoundError('StockOpnameItem', opnameItemId);
            }

            if (opnameItem.opname.status !== OpnameStatus.OPEN) {
                throw new BusinessRuleError('Hanya sesi OPEN yang dapat diupdate');
            }

            const existingCount = await tx.stockOpnameEntry.count({
                where: { opnameItemId },
            });

            if (existingCount >= MAX_ENTRIES_PER_ITEM) {
                throw new BusinessRuleError(
                    `Maksimal ${MAX_ENTRIES_PER_ITEM} entri per item`,
                );
            }

            const created = await tx.stockOpnameEntry.create({
                data: {
                    opnameItemId,
                    quantity,
                    label: label ?? null,
                    createdById: authSession.user.id,
                },
            });

            const agg = await tx.stockOpnameEntry.aggregate({
                where: { opnameItemId },
                _sum: { quantity: true },
            });

            const total = agg._sum.quantity != null
                ? toDecimalNumber(agg._sum.quantity)
                : quantity;

            await tx.stockOpnameItem.update({
                where: { id: opnameItemId },
                data: { countedQuantity: total },
            });

            return {
                id: created.id,
                quantity: toDecimalNumber(created.quantity) || quantity,
                label: created.label ?? label ?? null,
                createdAt: created.createdAt,
                countedQuantity: total,
                entryCount: existingCount + 1,
            };
        });

        return result;
    });
});

export const deleteOpnameEntry = withTenant(async function deleteOpnameEntry(
    entryId: string,
) {
    return safeAction(async () => {
        await requireRole([
            Role.WAREHOUSE,
            Role.PRODUCTION,
            Role.PLANNING,
        ]);

        const result = await prisma.$transaction(async (tx) => {
            const entry = await tx.stockOpnameEntry.findUnique({
                where: { id: entryId },
                select: {
                    id: true,
                    opnameItemId: true,
                    opnameItem: {
                        select: {
                            opnameId: true,
                            opname: {
                                select: { status: true },
                            },
                        },
                    },
                },
            });

            if (!entry) {
                throw new NotFoundError('StockOpnameEntry', entryId);
            }

            if (entry.opnameItem.opname.status !== OpnameStatus.OPEN) {
                throw new BusinessRuleError('Hanya sesi OPEN yang dapat diupdate');
            }

            await tx.stockOpnameEntry.delete({
                where: { id: entryId },
            });

            const agg = await tx.stockOpnameEntry.aggregate({
                where: { opnameItemId: entry.opnameItemId },
                _sum: { quantity: true },
            });

            const remainingCount = await tx.stockOpnameEntry.count({
                where: { opnameItemId: entry.opnameItemId },
            });

            const hasEntries = remainingCount > 0;

            if (!hasEntries) {
                await tx.stockOpnameItem.update({
                    where: { id: entry.opnameItemId },
                    data: { countedQuantity: null },
                });

                return {
                    countedQuantity: null as number | null,
                    entryCount: 0,
                };
            }

            const total = toDecimalNumber(agg._sum.quantity);

            await tx.stockOpnameItem.update({
                where: { id: entry.opnameItemId },
                data: { countedQuantity: total },
            });

            return {
                countedQuantity: total,
                entryCount: remainingCount,
            };
        });

        return result;
    });
});

export const saveOpnameCount = withTenant(async function saveOpnameCount(
    opnameId: string,
    items: { id: string; countedQuantity: number; notes?: string }[],
) {
    return safeAction(async () => {
        if (items.length === 0) {
            revalidateOpnamePaths(opnameId);
            return;
        }

        const itemIds = items.map((item) => item.id);
        const uniqueItemIds = [...new Set(itemIds)];
        if (uniqueItemIds.length !== itemIds.length) {
            throw new BusinessRuleError(
                'Duplicate stock opname item id in request payload',
            );
        }

        // Validate each item
        for (const item of items) {
            if (!Number.isFinite(item.countedQuantity) || item.countedQuantity < 0) {
                throw new BusinessRuleError(
                    'Jumlah item harus angka non-negatif yang valid',
                );
            }
            if (item.notes && item.notes.length > MAX_NOTES_LENGTH) {
                throw new BusinessRuleError(
                    `Catatan item maksimal ${MAX_NOTES_LENGTH} karakter`,
                );
            }
        }

        await prisma.$transaction(async (tx) => {
            // Validate session is OPEN
            const opname = await tx.stockOpname.findUnique({
                where: { id: opnameId },
                select: { status: true },
            });
            if (!opname) throw new NotFoundError('StockOpname', opnameId);
            if (opname.status !== OpnameStatus.OPEN) {
                throw new BusinessRuleError('Hanya sesi OPEN yang dapat diupdate');
            }

            const matchedCount = await tx.stockOpnameItem.count({
                where: {
                    opnameId,
                    id: { in: uniqueItemIds },
                },
            });

            if (matchedCount !== items.length) {
                throw new BusinessRuleError(
                    'Some stock opname items are invalid for this session',
                );
            }

            const countedQuantityCase = Prisma.sql`
                CASE "id"
                    ${Prisma.join(
                        items.map(
                            (item) =>
                                Prisma.sql`WHEN ${item.id} THEN ${item.countedQuantity}`,
                        ),
                        ' ',
                    )}
                    ELSE "countedQuantity"
                END
            `;

            const notesCase = Prisma.sql`
                CASE "id"
                    ${Prisma.join(
                        items.map(
                            (item) =>
                                Prisma.sql`WHEN ${item.id} THEN ${item.notes ?? null}`,
                        ),
                        ' ',
                    )}
                    ELSE "notes"
                END
            `;

            await tx.$executeRaw(Prisma.sql`
                UPDATE "StockOpnameItem"
                SET
                    "countedQuantity" = ${countedQuantityCase},
                    "notes" = ${notesCase}
                WHERE
                    "opnameId" = ${opnameId}
                    AND "id" IN (${Prisma.join(uniqueItemIds)});
            `);

            await tx.$executeRaw(Prisma.sql`
                UPDATE "StockOpnameItem" i
                SET "countedQuantity" = e.total
                FROM (
                    SELECT "opnameItemId", SUM("quantity") AS total
                    FROM "StockOpnameEntry"
                    WHERE "opnameItemId" IN (${Prisma.join(uniqueItemIds)})
                    GROUP BY "opnameItemId"
                ) e
                WHERE i.id = e."opnameItemId";
            `);
        });

        revalidateOpnamePaths(opnameId);
    });
});

export const completeOpname = withTenant(async function completeOpname(
    opnameId: string,
) {
    return safeAction(async () => {
        const session = await auth();
        if (!session?.user?.id) {
            throw new AuthenticationError('User not authenticated');
        }

        await StockOpnameService.completeOpname(opnameId, session.user.id);
        revalidateOpnamePaths(opnameId);
    });
});

export const addItemToOpname = withTenant(async function addItemToOpname(
    opnameId: string,
    productVariantId: string,
) {
    return safeAction(async () => {
        // Validasi sesi harus OPEN
        const opname = await prisma.stockOpname.findUnique({
            where: { id: opnameId },
            select: { status: true, locationId: true },
        });

        if (!opname) throw new NotFoundError('StockOpname', opnameId);
        if (opname.status !== 'OPEN')
            throw new BusinessRuleError(
                'Hanya bisa menambah item ke sesi yang OPEN',
            );

        // Validasi productVariant exists
        const variant = await prisma.productVariant.findUnique({
            where: { id: productVariantId },
            select: { id: true, name: true },
        });

        if (!variant)
            throw new NotFoundError('ProductVariant', productVariantId);

        // Cek duplikasi
        const existing = await prisma.stockOpnameItem.findUnique({
            where: {
                opnameId_productVariantId: {
                    opnameId,
                    productVariantId,
                },
            },
        });

        if (existing) {
            throw new BusinessRuleError(
                `Item "${variant.name}" already exists in this opname session`,
            );
        }

        await prisma.stockOpnameItem.create({
            data: {
                opnameId,
                productVariantId,
                systemQuantity: 0,
                countedQuantity: null,
            },
        });

        revalidateOpnamePaths(opnameId);
    });
});

export const deleteOpnameSession = withTenant(
    async function deleteOpnameSession(id: string) {
        return safeAction(async () => {
            const session = await prisma.stockOpname.findUnique({
                where: { id },
                select: { status: true },
            });

            if (!session) {
                throw new NotFoundError('StockOpname', id);
            }

            if (session.status !== 'OPEN') {
                throw new BusinessRuleError(
                    'Hanya sesi OPEN yang dapat dihapus',
                );
            }

            await prisma.stockOpname.delete({
                where: { id },
            });

            revalidateOpnamePaths();
        });
    },
);
