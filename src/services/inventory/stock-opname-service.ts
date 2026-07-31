import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { AccountingService } from '@/services/accounting/accounting-service';
import { toDecimalNumber } from '@/lib/utils/utils';
import { MovementType, OpnameStatus } from '@prisma/client';

export class StockOpnameService {
    static async completeOpname(
        opnameId: string,
        userId: string,
    ): Promise<void> {
        const opname = await prisma.stockOpname.findUnique({
            where: { id: opnameId },
            include: { items: true },
        });

        if (!opname) throw new NotFoundError('StockOpname', opnameId);
        if (opname.status !== OpnameStatus.OPEN)
            throw new BusinessRuleError('Sesi tidak terbuka');

        await prisma.$transaction(async (tx) => {
            // Defensive sum: if an item has per-roll entries, use that sum as source of truth
            const entrySums = await tx.stockOpnameEntry.groupBy({
                by: ['opnameItemId'],
                where: { opnameItem: { opnameId } },
                _sum: { quantity: true },
            });

            const entrySumMap = new Map<string, number>();
            for (const row of entrySums) {
                const raw = row._sum.quantity;
                if (raw === null || raw === undefined) continue;
                const num = toDecimalNumber(raw);
                if (Number.isFinite(num)) {
                    entrySumMap.set(row.opnameItemId, num);
                }
            }

            // 1. Process items with variance
            for (const item of opname.items) {
                const fromEntries = entrySumMap.get(item.id);
                const rawCounted =
                    fromEntries !== undefined ? fromEntries : item.countedQuantity;

                // If countedQuantity is null (and no entries), we assume it matched system (or wasn't checked)
                if (rawCounted === null || rawCounted === undefined) continue;

                // guard null sudah di atas; baru convert
                const countedQty = toDecimalNumber(rawCounted);

                if (!Number.isFinite(countedQty)) continue;

                // Use live system stock for variance calculation to avoid stale snapshot issues
                const liveStockRow = await tx.$queryRaw<
                    Array<{ quantity: string }>
                >`
                    SELECT "quantity"::text as quantity
                    FROM "Inventory"
                    WHERE "locationId" = ${opname.locationId} AND "productVariantId" = ${item.productVariantId}
                    FOR UPDATE
                `;
                const currentSystemQty = liveStockRow[0]
                    ? Number(liveStockRow[0].quantity)
                    : 0;

                const variance = countedQty - currentSystemQty;

                if (variance !== 0) {
                    // 2. Upsert Inventory (create if doesn't exist — handles items added manually via addItemToOpname)
                    // Upsert is atomic via ON CONFLICT, but guard duplicate race for safety similar to core-service
                    try {
                        await tx.inventory.upsert({
                            where: {
                                locationId_productVariantId: {
                                    locationId: opname.locationId,
                                    productVariantId: item.productVariantId,
                                },
                            },
                            update: {
                                quantity: countedQty,
                            },
                            create: {
                                locationId: opname.locationId,
                                productVariantId: item.productVariantId,
                                quantity: countedQty,
                            },
                        });
                    } catch (e: unknown) {
                        const pe = e as { code?: string; message?: string };
                        const isDup =
                            pe.code === 'P2002' ||
                            pe.message?.includes(
                                'Inventory_locationId_productVariantId_key',
                            );
                        if (!isDup) throw e;
                        await tx.inventory.update({
                            where: {
                                locationId_productVariantId: {
                                    locationId: opname.locationId,
                                    productVariantId: item.productVariantId,
                                },
                            },
                            data: { quantity: countedQty },
                        });
                    }

                    // 3. Create Movement
                    const movement = await tx.stockMovement.create({
                        data: {
                            type: MovementType.ADJUSTMENT,
                            productVariantId: item.productVariantId,
                            fromLocationId:
                                variance < 0 ? opname.locationId : null,
                            toLocationId:
                                variance > 0 ? opname.locationId : null,
                            quantity: Math.abs(variance),
                            reference:
                                opname.opnameNumber ||
                                `Stock Opname #${opname.id.slice(0, 8)}`,
                        },
                    });

                    // 4. Record Journal Entry
                    await AccountingService.recordInventoryMovement(
                        movement,
                        tx,
                    );
                }
            }

            // 5. Close Session with audit trail
            await tx.stockOpname.update({
                where: { id: opnameId },
                data: {
                    status: OpnameStatus.COMPLETED,
                    completedAt: new Date(),
                },
            });

            // 6. Log Activity
            await logActivity({
                userId,
                action: 'COMPLETE_OPNAME',
                entityType: 'StockOpname',
                entityId: opnameId,
                details: `Completed opname for location ${opname.locationId}`,
                tx,
            });
        });
    }
}
