'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { OpnameStatus, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import {
    safeAction,
    BusinessRuleError,
    NotFoundError,
} from '@/lib/errors/errors';
import { requireAuth, requireRole } from '@/lib/tools/auth-checks';
import { Role } from '@prisma/client';
import { StockOpnameService } from '@/services/inventory/stock-opname-service';

const MAX_NOTES_LENGTH = 500;
const MAX_REMARKS_LENGTH = 500;

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
            await requireRole([Role.WAREHOUSE, Role.ADMIN, Role.PRODUCTION, Role.PLANNING]);

            if (!locationId || typeof locationId !== 'string') {
                throw new BusinessRuleError('Lokasi harus dipilih');
            }
            if (remarks && remarks.length > MAX_REMARKS_LENGTH) {
                throw new BusinessRuleError(`Remarks maksimal ${MAX_REMARKS_LENGTH} karakter`);
            }

            // 1. Get all inventories for this location to snapshot
            const inventories = await prisma.inventory.findMany({
                where: {
                    locationId: locationId,
                },
            });

            if (inventories.length === 0) {
                throw new BusinessRuleError(
                    'No inventory found for this location to perform stock opname.',
                );
            }

            // 2. Generate Number
            const opnameNumber = await generateOpnameNumber();

            // 3. Create Session with audit trail
            const opnameSession = await prisma.stockOpname.create({
                data: {
                    opnameNumber,
                    locationId,
                    remarks,
                    status: OpnameStatus.OPEN,
                    createdById: (await requireAuth()).user.id,
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
        });
    },
);

export const saveOpnameCount = withTenant(async function saveOpnameCount(
    opnameId: string,
    items: { id: string; countedQuantity: number; notes?: string }[],
) {
    return safeAction(async () => {
        await requireRole([Role.WAREHOUSE, Role.ADMIN, Role.PRODUCTION, Role.PLANNING]);

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
        });

        revalidateOpnamePaths(opnameId);
    });
});

export const completeOpname = withTenant(async function completeOpname(
    opnameId: string,
) {
    return safeAction(async () => {
        const session = await requireAuth();

        await StockOpnameService.completeOpname(opnameId, session.user.id);
        revalidateOpnamePaths(opnameId);
    });
});

export const addItemToOpname = withTenant(async function addItemToOpname(
    opnameId: string,
    productVariantId: string,
) {
    return safeAction(async () => {
        await requireRole([Role.WAREHOUSE, Role.ADMIN, Role.PRODUCTION, Role.PLANNING]);

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
            await requireRole([Role.WAREHOUSE, Role.ADMIN]);

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
