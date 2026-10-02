import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import {
    getWibDayBounds,
    parseBusinessDate,
    toBusinessDateString,
} from '@/lib/utils/timezone';
import { AccountingService } from '@/services/accounting/accounting-service';
import { MovementType, OpnameStatus, Prisma } from '@prisma/client';

type QuantityRow = { quantity: string };
type MovementSumRow = {
    productVariantId: string;
    cutoffQuantity: string;
    ledgerQuantity: string;
};

function toDecimal(value: Prisma.Decimal | number | string): Prisma.Decimal {
    return new Prisma.Decimal(value.toString());
}

function resolveEffectiveTimestamp(
    effectiveDate: string,
    finalizedAt: Date,
): Date {
    try {
        parseBusinessDate(effectiveDate);
    } catch {
        throw new BusinessRuleError(
            'Tanggal efektif tidak valid. Gunakan format YYYY-MM-DD.',
        );
    }

    const today = toBusinessDateString(finalizedAt);
    if (effectiveDate > today) {
        throw new BusinessRuleError(
            'Tanggal efektif stock opname tidak boleh di masa depan.',
        );
    }

    const endOfDay = getWibDayBounds(effectiveDate).endOfDay;
    return effectiveDate === today ? finalizedAt : endOfDay;
}

export class StockOpnameService {
    static async completeOpname(
        opnameId: string,
        effectiveDate: string,
        userId: string,
    ): Promise<void> {
        const finalizedAt = new Date();
        const effectiveAt = resolveEffectiveTimestamp(
            effectiveDate,
            finalizedAt,
        );
        const { startOfDay: effectiveDayStart } =
            getWibDayBounds(effectiveDate);
        const [effectiveYear, effectiveMonth] = effectiveDate
            .split('-')
            .map(Number);

        await prisma.$transaction(async (tx) => {
            // Serialize finalization attempts before re-reading the mutable session.
            const lockedSession = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id"
                FROM "StockOpname"
                WHERE "id" = ${opnameId}
                FOR UPDATE
            `;
            if (lockedSession.length === 0) {
                throw new NotFoundError('StockOpname', opnameId);
            }

            const opname = await tx.stockOpname.findUnique({
                where: { id: opnameId },
                include: { items: true },
            });
            if (!opname) throw new NotFoundError('StockOpname', opnameId);
            if (opname.status !== OpnameStatus.OPEN) {
                throw new BusinessRuleError('Sesi tidak terbuka');
            }

            // A shared period lock prevents the period from being closed while
            // stock adjustments and their journals are being posted.
            const fiscalPeriod = await tx.$queryRaw<Array<{ status: string }>>`
                SELECT "status"::text AS status
                FROM "FiscalPeriod"
                WHERE "year" = ${effectiveYear} AND "month" = ${effectiveMonth}
                FOR SHARE
            `;
            if (fiscalPeriod[0]?.status !== 'OPEN') {
                throw new BusinessRuleError(
                    'Tanggal efektif berada pada periode fiskal yang sudah ditutup atau belum dibuat.',
                    { effectiveDate },
                    'FISCAL_PERIOD_CLOSED',
                );
            }

            // Lock rows that drive stock writes in deterministic order before
            // reading them, so a concurrent movement cannot slip between the
            // ledger snapshot and the delta update.
            const variantIds = opname.items.map(
                (item) => item.productVariantId,
            );
            const liveRows =
                variantIds.length === 0
                    ? []
                    : await tx.$queryRaw<
                          Array<
                              QuantityRow & { productVariantId: string }
                          >
                      >(Prisma.sql`
                          SELECT
                              "productVariantId",
                              "quantity"::text AS quantity
                          FROM "Inventory"
                          WHERE "locationId" = ${opname.locationId}
                            AND "productVariantId" IN (${Prisma.join(variantIds)})
                          ORDER BY "productVariantId"
                          FOR UPDATE
                      `);
            const liveByVariant = new Map(
                liveRows.map((row) => [row.productVariantId, row] as const),
            );

            // Historical opname adjustments must be posted in chronological
            // order. Otherwise a later physical-count anchor would be invalidated.
            const laterOpname = await tx.$queryRaw<
                Array<{
                    opnameNumber: string | null;
                    effectiveDate: Date | null;
                    completedAt: Date | null;
                }>
            >`
                SELECT
                    "opnameNumber",
                    "effectiveDate",
                    "completedAt"
                FROM "StockOpname"
                WHERE "id" <> ${opnameId}
                  AND "locationId" = ${opname.locationId}
                  AND "status" = ${OpnameStatus.COMPLETED}::"OpnameStatus"
                  AND (
                      "effectiveDate" >= ${effectiveDayStart}
                      OR (
                          "effectiveDate" IS NULL
                          AND "completedAt" >= ${effectiveDayStart}
                          AND "completedAt" <= ${finalizedAt}
                      )
                  )
                ORDER BY COALESCE("effectiveDate", "completedAt") DESC
                LIMIT 1
                FOR SHARE
            `;
            if (laterOpname[0]) {
                throw new BusinessRuleError(
                    `Tidak dapat backdate karena sudah ada stock opname lokasi ini pada tanggal yang sama atau lebih baru (${laterOpname[0].opnameNumber || 'tanpa nomor'}).`,
                );
            }

            const itemIds = opname.items.map((item) => item.id);
            const entrySums =
                itemIds.length === 0
                    ? []
                    : await tx.stockOpnameEntry.groupBy({
                          by: ['opnameItemId'],
                          where: { opnameItemId: { in: itemIds } },
                          _sum: { quantity: true },
                      });
            const entrySumMap = new Map(
                entrySums.flatMap((row) =>
                    row._sum.quantity == null
                        ? []
                        : [
                              [
                                  row.opnameItemId,
                                  toDecimal(row._sum.quantity),
                              ] as const,
                          ],
                ),
            );

            // The dated stock reports use StockMovement as their source of
            // truth, so the cutoff balance must come from the same ledger. The
            // all-time sum is checked against Inventory before applying a delta;
            // a mismatch must be reconciled instead of silently producing a
            // correct live balance but an incorrect historical report.
            const movementRows =
                variantIds.length === 0
                    ? []
                    : await tx.$queryRaw<MovementSumRow[]>(Prisma.sql`
                          SELECT
                              "productVariantId",
                              COALESCE(SUM(
                                  CASE WHEN "createdAt" <= ${effectiveAt} THEN
                                      CASE WHEN "toLocationId" = ${opname.locationId} THEN "quantity" ELSE 0 END
                                      - CASE WHEN "fromLocationId" = ${opname.locationId} THEN "quantity" ELSE 0 END
                                  ELSE 0 END
                              ), 0)::text AS "cutoffQuantity",
                              COALESCE(SUM(
                                  CASE WHEN "toLocationId" = ${opname.locationId} THEN "quantity" ELSE 0 END
                                  - CASE WHEN "fromLocationId" = ${opname.locationId} THEN "quantity" ELSE 0 END
                              ), 0)::text AS "ledgerQuantity"
                          FROM "StockMovement"
                          WHERE "productVariantId" IN (${Prisma.join(variantIds)})
                            AND (
                                "fromLocationId" = ${opname.locationId}
                                OR "toLocationId" = ${opname.locationId}
                            )
                          GROUP BY "productVariantId"
                      `);
            const movementByVariant = new Map(
                movementRows.map((row) => [row.productVariantId, row] as const),
            );

            for (const item of opname.items) {
                const countedQuantity =
                    entrySumMap.get(item.id) ??
                    (item.countedQuantity == null
                        ? null
                        : toDecimal(item.countedQuantity));
                // Uncounted items receive no adjustment, preserving existing behavior.
                if (countedQuantity === null) continue;

                const liveRow = liveByVariant.get(item.productVariantId);
                const liveQuantity = toDecimal(liveRow?.quantity ?? 0);
                const movementTotals = movementByVariant.get(
                    item.productVariantId,
                );
                const cutoffQuantity = toDecimal(
                    movementTotals?.cutoffQuantity ?? 0,
                );
                const ledgerQuantity = toDecimal(
                    movementTotals?.ledgerQuantity ?? 0,
                );
                if (!ledgerQuantity.equals(liveQuantity)) {
                    throw new BusinessRuleError(
                        'Saldo stok berjalan tidak sama dengan kartu stok. Rekonsiliasi stok diperlukan sebelum finalisasi.',
                        {
                            productVariantId: item.productVariantId,
                            liveQuantity: liveQuantity.toString(),
                            ledgerQuantity: ledgerQuantity.toString(),
                        },
                        'OPNAME_LEDGER_MISMATCH',
                    );
                }

                // Persist the exact baseline used by finalization so the
                // completed variance report reflects the selected cutoff, not
                // the potentially later session-creation snapshot.
                await tx.stockOpnameItem.update({
                    where: { id: item.id },
                    data: { systemQuantity: cutoffQuantity },
                });

                const variance = countedQuantity.minus(cutoffQuantity);
                if (variance.isZero()) continue;

                const resultingLiveQuantity = liveQuantity.plus(variance);
                if (resultingLiveQuantity.isNegative()) {
                    throw new BusinessRuleError(
                        'Finalisasi akan membuat stok berjalan negatif. Periksa hasil hitung dan mutasi setelah tanggal efektif.',
                        {
                            productVariantId: item.productVariantId,
                            liveQuantity: liveQuantity.toString(),
                            cutoffQuantity: cutoffQuantity.toString(),
                            countedQuantity: countedQuantity.toString(),
                        },
                        'OPNAME_NEGATIVE_LIVE_STOCK',
                    );
                }

                const isIncrement = variance.isPositive();
                try {
                    await tx.inventory.upsert({
                        where: {
                            locationId_productVariantId: {
                                locationId: opname.locationId,
                                productVariantId: item.productVariantId,
                            },
                        },
                        update: {
                            quantity: isIncrement
                                ? { increment: variance }
                                : { decrement: variance.abs() },
                        },
                        create: {
                            locationId: opname.locationId,
                            productVariantId: item.productVariantId,
                            quantity: resultingLiveQuantity,
                        },
                    });
                } catch (error: unknown) {
                    const prismaError = error as {
                        code?: string;
                        message?: string;
                    };
                    const isDuplicate =
                        prismaError.code === 'P2002' ||
                        prismaError.message?.includes(
                            'Inventory_locationId_productVariantId_key',
                        );
                    if (!isDuplicate) throw error;
                    await tx.inventory.update({
                        where: {
                            locationId_productVariantId: {
                                locationId: opname.locationId,
                                productVariantId: item.productVariantId,
                            },
                        },
                        data: {
                            quantity: isIncrement
                                ? { increment: variance }
                                : { decrement: variance.abs() },
                        },
                    });
                }

                const movement = await tx.stockMovement.create({
                    data: {
                        type: MovementType.ADJUSTMENT,
                        productVariantId: item.productVariantId,
                        fromLocationId: isIncrement
                            ? null
                            : opname.locationId,
                        toLocationId: isIncrement
                            ? opname.locationId
                            : null,
                        quantity: variance.abs(),
                        reference:
                            opname.opnameNumber ||
                            `Stock Opname #${opname.id.slice(0, 8)}`,
                        createdById: userId,
                        createdAt: effectiveAt,
                    },
                });

                await AccountingService.recordInventoryMovement(
                    movement,
                    tx,
                );
            }

            await tx.stockOpname.update({
                where: { id: opnameId },
                data: {
                    status: OpnameStatus.COMPLETED,
                    effectiveDate: effectiveAt,
                    completedAt: finalizedAt,
                },
            });

            await logActivity({
                userId,
                action: 'COMPLETE_OPNAME',
                entityType: 'StockOpname',
                entityId: opnameId,
                details: `Completed opname for location ${opname.locationId}; effective date ${effectiveDate}`,
                tx,
            });
        }, { timeout: 30_000, maxWait: 10_000 });
    }
}
