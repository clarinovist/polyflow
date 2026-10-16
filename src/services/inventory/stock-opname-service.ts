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

interface PreviewRow {
    itemId: string;
    productVariantId: string;
    skuCode: string;
    name: string;
    unit: string;
    snapshotQuantity: string;
    storedCountedQuantity: string | null;
    entryTotal: string | null;
    unitCost: string;
    liveQuantity?: string;
    ledgerQuantity?: string;
    cutoffQuantity?: string;
}

function formatWibDateTime(value: Date): string {
    return new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Jakarta',
    }).format(value);
}

export type OpnameFinalizationBlockerCode =
    | 'OPNAME_NOT_OPEN'
    | 'FISCAL_PERIOD_CLOSED'
    | 'OPNAME_BACKDATE_CONFLICT'
    | 'OPNAME_LEDGER_MISMATCH'
    | 'OPNAME_NEGATIVE_LIVE_STOCK';

export type OpnameFinalizationWarningCode =
    | 'OPNAME_COUNT_BEFORE_MOVEMENT'
    | 'OPNAME_QUANTITY_OUTLIER'
    | 'OPNAME_HIGH_VALUE_IMPACT';

/**
 * Absolute money threshold above which the operator must explicitly
 * acknowledge the adjustment before finalizing.
 */
export const OPNAME_HIGH_VALUE_ACK_THRESHOLD = 1_000_000;
/**
 * A count that is >=100x (or <=1/100 of) the cutoff or session snapshot is
 * almost always a unit or decimal entry mistake, so it needs acknowledgement.
 */
export const OPNAME_QUANTITY_OUTLIER_RATIO = 100;

const MAX_LISTED_BLOCKER_ITEMS = 10;
const MAX_LISTED_WARNING_ITEMS = 5;

export interface OpnameFinalizationPreviewItem {
    opnameItemId: string;
    productVariantId: string;
    skuCode: string;
    name: string;
    unit: string;
    snapshotQuantity: string;
    countedQuantity: string | null;
    cutoffQuantity: string;
    liveQuantity: string;
    ledgerQuantity: string;
    variance: string;
    projectedLiveQuantity: string;
    valueImpact: string;
}

export interface OpnameFinalizationBlocker {
    code: OpnameFinalizationBlockerCode;
    message: string;
    items?: Array<{
        skuCode: string;
        name: string;
        detail: string;
    }>;
    truncatedItems?: number;
}

export interface OpnameFinalizationWarning {
    code: OpnameFinalizationWarningCode;
    message: string;
    items: Array<{
        skuCode: string;
        name: string;
        detail: string;
    }>;
    truncatedItems?: number;
}

export interface OpnameFinalizationPreview {
    opnameId: string;
    opnameNumber: string | null;
    status: OpnameStatus;
    effectiveDate: string;
    effectiveAt: string;
    itemCount: number;
    countedCount: number;
    uncountedCount: number;
    varianceCount: number;
    gainValue: string;
    lossValue: string;
    netValue: string;
    blockers: OpnameFinalizationBlocker[];
    warnings: OpnameFinalizationWarning[];
    /** True when no guard blocks finalization (see `requiresAcknowledgement`). */
    canFinalize: boolean;
    /** Operator must tick an explicit acknowledgement before finalizing. */
    requiresAcknowledgement: boolean;
    outlierItems: OpnameFinalizationPreviewItem[];
}

interface VarianceDecision {
    ledgerMismatch: boolean;
    variance: Prisma.Decimal;
    projectedLive: Prisma.Decimal;
    negative: boolean;
}

/**
 * Single source of truth for the two per-item finalization guards. Both the
 * write path (`completeOpname`) and the read-only preview call this so a
 * preview can never disagree with what finalization will enforce.
 */
export function evaluateFinalizationVariance(input: {
    countedQuantity: Prisma.Decimal;
    cutoffQuantity: Prisma.Decimal;
    liveQuantity: Prisma.Decimal;
    ledgerQuantity: Prisma.Decimal;
}): VarianceDecision {
    const variance = input.countedQuantity.minus(input.cutoffQuantity);
    const projectedLive = input.liveQuantity.plus(variance);
    return {
        ledgerMismatch: !input.ledgerQuantity.equals(input.liveQuantity),
        variance,
        projectedLive,
        negative: projectedLive.isNegative(),
    };
}

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
                const decision = evaluateFinalizationVariance({
                    countedQuantity,
                    cutoffQuantity,
                    liveQuantity,
                    ledgerQuantity,
                });
                if (decision.ledgerMismatch) {
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

                const variance = decision.variance;
                if (variance.isZero()) continue;

                const resultingLiveQuantity = decision.projectedLive;
                if (decision.negative) {
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

    /**
     * Read-only preview of the finalization for one effective date.
     *
     * Operators previously only learned about a rejected finalization from a
     * transient toast, and nothing warned when the physical count had been
     * taken before stock movements inside the chosen effective day. That made
     * a wrong effective date invisible until it produced a negative balance or
     * silent phantom stock. This preview names every blocking item, projects
     * quantity and value impact, and flags counts that predate later movements.
     *
     * Guard decisions are shared with `completeOpname` via
     * `evaluateFinalizationVariance`, so the preview cannot disagree with what
     * finalization enforces.
     */
    static async previewFinalization(
        opnameId: string,
        effectiveDate: string,
    ): Promise<OpnameFinalizationPreview> {
        const previewedAt = new Date();
        const effectiveAt = resolveEffectiveTimestamp(
            effectiveDate,
            previewedAt,
        );
        const { startOfDay: effectiveDayStart } =
            getWibDayBounds(effectiveDate);
        const [effectiveYear, effectiveMonth] = effectiveDate
            .split('-')
            .map(Number);

        return prisma.$transaction(
            async (tx) => {
                const opname = await tx.stockOpname.findUnique({
                    where: { id: opnameId },
                    select: {
                        id: true,
                        opnameNumber: true,
                        status: true,
                        locationId: true,
                        items: { select: { id: true } },
                    },
                });
                if (!opname) throw new NotFoundError('StockOpname', opnameId);

                const blockers: OpnameFinalizationBlocker[] = [];
                const warnings: OpnameFinalizationWarning[] = [];
                const base = {
                    opnameId: opname.id,
                    opnameNumber: opname.opnameNumber,
                    status: opname.status,
                    effectiveDate,
                    effectiveAt: effectiveAt.toISOString(),
                };
                const emptyResult: OpnameFinalizationPreview = {
                    ...base,
                    itemCount: opname.items.length,
                    countedCount: 0,
                    uncountedCount: 0,
                    varianceCount: 0,
                    gainValue: '0.00',
                    lossValue: '0.00',
                    netValue: '0.00',
                    blockers,
                    warnings,
                    canFinalize: false,
                    requiresAcknowledgement: false,
                    outlierItems: [],
                };

                if (opname.status !== OpnameStatus.OPEN) {
                    blockers.push({
                        code: 'OPNAME_NOT_OPEN',
                        message: 'Sesi tidak terbuka',
                    });
                    return emptyResult;
                }

                const fiscalPeriod = await tx.$queryRaw<
                    Array<{ status: string }>
                >`
                    SELECT "status"::text AS status
                    FROM "FiscalPeriod"
                    WHERE "year" = ${effectiveYear} AND "month" = ${effectiveMonth}
                `;
                if (fiscalPeriod[0]?.status !== 'OPEN') {
                    blockers.push({
                        code: 'FISCAL_PERIOD_CLOSED',
                        message:
                            'Tanggal efektif berada pada periode fiskal yang sudah ditutup atau belum dibuat.',
                    });
                }

                const laterOpname = await tx.$queryRaw<
                    Array<{ opnameNumber: string | null }>
                >`
                    SELECT "opnameNumber"
                    FROM "StockOpname"
                    WHERE "id" <> ${opnameId}
                      AND "locationId" = ${opname.locationId}
                      AND "status" = ${OpnameStatus.COMPLETED}::"OpnameStatus"
                      AND (
                          "effectiveDate" >= ${effectiveDayStart}
                          OR (
                              "effectiveDate" IS NULL
                              AND "completedAt" >= ${effectiveDayStart}
                              AND "completedAt" <= ${previewedAt}
                          )
                      )
                    ORDER BY COALESCE("effectiveDate", "completedAt") DESC
                    LIMIT 1
                `;
                if (laterOpname[0]) {
                    blockers.push({
                        code: 'OPNAME_BACKDATE_CONFLICT',
                        message: `Tidak dapat backdate karena sudah ada stock opname lokasi ini pada tanggal yang sama atau lebih baru (${laterOpname[0].opnameNumber || 'tanpa nomor'}).`,
                    });
                }

                const rows = await tx.$queryRaw<PreviewRow[]>(Prisma.sql`
                    SELECT
                        oi."id" AS "itemId",
                        oi."productVariantId" AS "productVariantId",
                        pv."skuCode" AS "skuCode",
                        pv."name" AS "name",
                        pv."primaryUnit"::text AS "unit",
                        oi."systemQuantity"::text AS "snapshotQuantity",
                        oi."countedQuantity"::text AS "storedCountedQuantity",
                        es.total::text AS "entryTotal",
                        COALESCE(pv."standardCost", pv."buyPrice", pv.price, 0)::text AS "unitCost"
                    FROM "StockOpnameItem" oi
                    JOIN "ProductVariant" pv ON pv.id = oi."productVariantId"
                    LEFT JOIN LATERAL (
                        SELECT SUM(e."quantity") AS total
                        FROM "StockOpnameEntry" e
                        WHERE e."opnameItemId" = oi."id"
                    ) es ON true
                    LEFT JOIN LATERAL (
                        SELECT
                            SUM(
                                CASE WHEN sm."toLocationId" = ${opname.locationId} THEN sm.quantity ELSE 0 END
                                - CASE WHEN sm."fromLocationId" = ${opname.locationId} THEN sm.quantity ELSE 0 END
                            ) AS ledger,
                            SUM(
                                CASE WHEN sm."createdAt" <= ${effectiveAt} THEN
                                    CASE WHEN sm."toLocationId" = ${opname.locationId} THEN sm.quantity ELSE 0 END
                                    - CASE WHEN sm."fromLocationId" = ${opname.locationId} THEN sm.quantity ELSE 0 END
                                ELSE 0 END
                            ) AS cutoff
                        FROM "StockMovement" sm
                        WHERE sm."productVariantId" = oi."productVariantId"
                          AND (
                              sm."fromLocationId" = ${opname.locationId}
                              OR sm."toLocationId" = ${opname.locationId}
                          )
                    ) l ON true
                    LEFT JOIN "Inventory" inv
                      ON inv."locationId" = ${opname.locationId}
                     AND inv."productVariantId" = oi."productVariantId"
                    WHERE oi."opnameId" = ${opnameId}
                    ORDER BY pv."skuCode"
                `);

                const mismatchItems: Array<{
                    skuCode: string;
                    name: string;
                    detail: string;
                }> = [];
                const negativeItems: typeof mismatchItems = [];
                const outlierItems: OpnameFinalizationPreviewItem[] = [];
                const outlierList: typeof mismatchItems = [];
                let countedCount = 0;
                let uncountedCount = 0;
                let varianceCount = 0;
                let gainValue = new Prisma.Decimal(0);
                let lossValue = new Prisma.Decimal(0);

                for (const row of rows) {
                    const counted =
                        row.entryTotal != null
                            ? toDecimal(row.entryTotal)
                            : row.storedCountedQuantity != null
                              ? toDecimal(row.storedCountedQuantity)
                              : null;
                    const liveQuantity = toDecimal(row.liveQuantity ?? 0);
                    const ledgerQuantity = toDecimal(row.ledgerQuantity ?? 0);
                    const cutoffQuantity = toDecimal(row.cutoffQuantity ?? 0);

                    if (counted === null) {
                        uncountedCount += 1;
                        continue;
                    }
                    countedCount += 1;

                    const decision = evaluateFinalizationVariance({
                        countedQuantity: counted,
                        cutoffQuantity,
                        liveQuantity,
                        ledgerQuantity,
                    });
                    if (decision.ledgerMismatch) {
                        mismatchItems.push({
                            skuCode: row.skuCode,
                            name: row.name,
                            detail: `berjalan ${liveQuantity.toString()} vs kartu stok ${ledgerQuantity.toString()}`,
                        });
                    }
                    if (decision.negative) {
                        negativeItems.push({
                            skuCode: row.skuCode,
                            name: row.name,
                            detail: `hitung ${counted.toString()} vs saldo cutoff ${cutoffQuantity.toString()} → proyeksi ${decision.projectedLive.toString()}`,
                        });
                    }

                    const variance = decision.variance;
                    if (!variance.isZero()) varianceCount += 1;

                    const unitCost = toDecimal(row.unitCost ?? 0);
                    const valueImpact = variance.mul(unitCost);
                    if (valueImpact.isPositive()) {
                        gainValue = gainValue.plus(valueImpact);
                    } else if (valueImpact.isNegative()) {
                        lossValue = lossValue.plus(valueImpact.abs());
                    }

                    const snapshot = toDecimal(row.snapshotQuantity ?? 0);
                    const ratioBase = cutoffQuantity.isZero()
                        ? snapshot
                        : cutoffQuantity;
                    const isOutlier =
                        !ratioBase.isZero() &&
                        (counted
                            .div(ratioBase)
                            .greaterThanOrEqualTo(
                                OPNAME_QUANTITY_OUTLIER_RATIO,
                            ) ||
                            ratioBase
                                .div(counted.isZero() ? 1 : counted)
                                .greaterThanOrEqualTo(
                                    OPNAME_QUANTITY_OUTLIER_RATIO,
                                ));
                    if (isOutlier) {
                        const previewItem: OpnameFinalizationPreviewItem = {
                            opnameItemId: row.itemId,
                            productVariantId: row.productVariantId,
                            skuCode: row.skuCode,
                            name: row.name,
                            unit: row.unit,
                            snapshotQuantity: row.snapshotQuantity,
                            countedQuantity: counted.toString(),
                            cutoffQuantity: cutoffQuantity.toString(),
                            liveQuantity: liveQuantity.toString(),
                            ledgerQuantity: ledgerQuantity.toString(),
                            variance: variance.toString(),
                            projectedLiveQuantity:
                                decision.projectedLive.toString(),
                            valueImpact: valueImpact.toFixed(2),
                        };
                        if (outlierItems.length < MAX_LISTED_WARNING_ITEMS) {
                            outlierItems.push(previewItem);
                        }
                        outlierList.push({
                            skuCode: row.skuCode,
                            name: row.name,
                            detail: `hitung ${counted.toString()} ${row.unit} vs saldo ${ratioBase.toString()} ${row.unit}`,
                        });
                    }
                }

                if (mismatchItems.length > 0) {
                    blockers.push({
                        code: 'OPNAME_LEDGER_MISMATCH',
                        message:
                            'Saldo stok berjalan tidak sama dengan kartu stok. Rekonsiliasi stok diperlukan sebelum finalisasi.',
                        items: mismatchItems.slice(0, MAX_LISTED_BLOCKER_ITEMS),
                        truncatedItems: Math.max(
                            0,
                            mismatchItems.length - MAX_LISTED_BLOCKER_ITEMS,
                        ),
                    });
                }
                if (negativeItems.length > 0) {
                    blockers.push({
                        code: 'OPNAME_NEGATIVE_LIVE_STOCK',
                        message:
                            'Finalisasi akan membuat stok berjalan negatif. Periksa hasil hitung dan mutasi setelah tanggal efektif.',
                        items: negativeItems.slice(0, MAX_LISTED_BLOCKER_ITEMS),
                        truncatedItems: Math.max(
                            0,
                            negativeItems.length - MAX_LISTED_BLOCKER_ITEMS,
                        ),
                    });
                }

                // Counts recorded before movements inside the effective day mean
                // the physical count describes an earlier position than the
                // cutoff. This is the exact pattern that silently produced a
                // phantom stock adjustment.
                const staleCountRows = await tx.$queryRaw<
                    Array<{
                        itemId: string;
                        skuCode: string;
                        name: string;
                        createdAt: Date;
                        quantity: string;
                        stockIn: boolean;
                        reference: string | null;
                    }>
                >(Prisma.sql`
                    SELECT
                        oi."id" AS "itemId",
                        pv."skuCode" AS "skuCode",
                        pv."name" AS "name",
                        sm."createdAt" AS "createdAt",
                        sm."quantity"::text AS quantity,
                        (sm."toLocationId" = ${opname.locationId}) AS "stockIn",
                        sm."reference" AS reference
                    FROM "StockOpnameItem" oi
                    JOIN "ProductVariant" pv ON pv.id = oi."productVariantId"
                    JOIN "StockMovement" sm
                      ON sm."productVariantId" = oi."productVariantId"
                    WHERE oi."opnameId" = ${opnameId}
                      AND (
                          sm."fromLocationId" = ${opname.locationId}
                          OR sm."toLocationId" = ${opname.locationId}
                      )
                      AND sm."createdAt" <= ${effectiveAt}
                      AND sm."createdAt" > GREATEST(
                          oi."updatedAt",
                          COALESCE(
                              (
                                  SELECT MAX(e."createdAt")
                                  FROM "StockOpnameEntry" e
                                  WHERE e."opnameItemId" = oi."id"
                              ),
                              oi."updatedAt"
                          )
                      )
                    ORDER BY sm."createdAt"
                    LIMIT 200
                `);

                const countedItemIds = new Set(
                    rows.flatMap((row) => {
                        const hasCount =
                            row.entryTotal != null ||
                            row.storedCountedQuantity != null;
                        return hasCount ? [row.itemId] : [];
                    }),
                );
                const staleItems: typeof mismatchItems = [];
                const staleSeen = new Set<string>();
                for (const row of staleCountRows) {
                    if (!countedItemIds.has(row.itemId)) continue;
                    if (staleSeen.has(row.itemId)) continue;
                    staleSeen.add(row.itemId);
                    staleItems.push({
                        skuCode: row.skuCode,
                        name: row.name,
                        detail: `${row.stockIn ? 'masuk' : 'keluar'} ${row.quantity} setelah penghitungan (${row.reference || 'tanpa referensi'}, ${formatWibDateTime(row.createdAt)})`,
                    });
                }
                if (staleItems.length > 0) {
                    warnings.push({
                        code: 'OPNAME_COUNT_BEFORE_MOVEMENT',
                        message:
                            'Ada mutasi stok pada tanggal efektif setelah penghitungan terakhir. Pindah tanggal efektif atau hitung ulang item berikut.',
                        items: staleItems.slice(0, MAX_LISTED_WARNING_ITEMS),
                        truncatedItems: Math.max(
                            0,
                            staleItems.length - MAX_LISTED_WARNING_ITEMS,
                        ),
                    });
                }
                if (outlierList.length > 0) {
                    warnings.push({
                        code: 'OPNAME_QUANTITY_OUTLIER',
                        message: `Ada ${outlierList.length} item dengan selisih sangat besar (minimal ${OPNAME_QUANTITY_OUTLIER_RATIO}x). Periksa satuan dan desimal sebelum melanjutkan.`,
                        items: outlierList.slice(0, MAX_LISTED_WARNING_ITEMS),
                        truncatedItems: Math.max(
                            0,
                            outlierList.length - MAX_LISTED_WARNING_ITEMS,
                        ),
                    });
                }
                const absoluteValue = gainValue.plus(lossValue);
                if (
                    absoluteValue.greaterThanOrEqualTo(
                        OPNAME_HIGH_VALUE_ACK_THRESHOLD,
                    )
                ) {
                    warnings.push({
                        code: 'OPNAME_HIGH_VALUE_IMPACT',
                        message: `Total penyesuaian senilai Rp${absoluteValue.toFixed(2)}. Pastikan hasil hitung fisik sudah benar.`,
                        items: [
                            {
                                skuCode: '—',
                                name: 'Dampak nilai finalisasi',
                                detail: `selisih lebih Rp${gainValue.toFixed(2)} · selisih kurang Rp${lossValue.toFixed(2)}`,
                            },
                        ],
                    });
                }

                return {
                    ...base,
                    itemCount: rows.length,
                    countedCount,
                    uncountedCount,
                    varianceCount,
                    gainValue: gainValue.toFixed(2),
                    lossValue: lossValue.toFixed(2),
                    netValue: gainValue.minus(lossValue).toFixed(2),
                    blockers,
                    warnings,
                    canFinalize: blockers.length === 0,
                    requiresAcknowledgement: warnings.length > 0,
                    outlierItems,
                };
            },
            { timeout: 30_000, maxWait: 10_000 },
        );
    }
}
