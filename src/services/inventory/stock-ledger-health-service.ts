import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';

const HEALTH_TX_TIMEOUT_MS = 60_000;
const MATERIAL_DIFF_THRESHOLD = new Prisma.Decimal('0.01');
const MAX_SUMMARY_ITEMS = 10;

export interface StockLedgerMismatch {
    productVariantId: string;
    locationId: string;
    skuCode: string;
    locationName: string;
    live: string;
    ledger: string;
    diff: string;
}

export interface StockLedgerHealth {
    mismatches: StockLedgerMismatch[];
    roundingCount: number;
    materialCount: number;
    findings: number;
}

export interface StockLedgerPairMovement {
    id: string;
    createdAt: string;
    type: string;
    reference: string | null;
    inQuantity: string;
    outQuantity: string;
    delta: string;
    runningBalance: string;
}

export interface StockLedgerPairHistory {
    productVariantId: string;
    locationId: string;
    live: string;
    ledger: string;
    diff: string;
    openingBalance: string;
    truncated: boolean;
    totalMovements: number;
    firstNegative: StockLedgerPairMovement | null;
    movements: StockLedgerPairMovement[];
}

type RawMismatchRow = {
    productVariantId: string;
    locationId: string;
    skuCode: string;
    locationName: string;
    live: Prisma.Decimal | string | number;
    ledger: Prisma.Decimal | string | number;
    diff?: Prisma.Decimal | string | number;
};

/**
 * Read-only daily detection comparing live Inventory.quantity against the
 * all-time StockMovement ledger (inbound toLocationId minus outbound
 * fromLocationId per variant + location, matching opname finalization).
 */
export async function checkStockLedgerHealth(): Promise<StockLedgerHealth> {
    return prisma.$transaction(
        async (tx) => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            const rows = await tx.$queryRaw<RawMismatchRow[]>(Prisma.sql`
                WITH ledger AS (
                    SELECT
                        "productVariantId",
                        "locationId",
                        COALESCE(SUM("inQuantity") - SUM("outQuantity"), 0) AS "ledgerQuantity"
                    FROM (
                        SELECT
                            "productVariantId",
                            "toLocationId" AS "locationId",
                            "quantity" AS "inQuantity",
                            0::numeric AS "outQuantity"
                        FROM "StockMovement"
                        WHERE "toLocationId" IS NOT NULL
                        UNION ALL
                        SELECT
                            "productVariantId",
                            "fromLocationId" AS "locationId",
                            0::numeric AS "inQuantity",
                            "quantity" AS "outQuantity"
                        FROM "StockMovement"
                        WHERE "fromLocationId" IS NOT NULL
                    ) m
                    GROUP BY "productVariantId", "locationId"
                )
                SELECT
                    pv."id" AS "productVariantId",
                    loc."id" AS "locationId",
                    pv."skuCode" AS "skuCode",
                    loc."name" AS "locationName",
                    COALESCE(inv."quantity", 0)::text AS "live",
                    COALESCE(l."ledgerQuantity", 0)::text AS "ledger",
                    (COALESCE(inv."quantity", 0) - COALESCE(l."ledgerQuantity", 0))::text AS "diff"
                FROM "Inventory" inv
                FULL JOIN ledger l
                  ON l."productVariantId" = inv."productVariantId"
                 AND l."locationId" = inv."locationId"
                JOIN "ProductVariant" pv
                  ON pv."id" = COALESCE(inv."productVariantId", l."productVariantId")
                JOIN "Location" loc
                  ON loc."id" = COALESCE(inv."locationId", l."locationId")
                WHERE COALESCE(inv."quantity", 0) <> COALESCE(l."ledgerQuantity", 0)
                ORDER BY
                    ABS(COALESCE(inv."quantity", 0) - COALESCE(l."ledgerQuantity", 0)) DESC,
                    pv."skuCode" ASC,
                    loc."name" ASC
            `);

            const mapped: Array<{
                item: StockLedgerMismatch;
                absDiff: Prisma.Decimal;
            }> = [];
            for (const row of rows) {
                const live = new Prisma.Decimal(row.live ?? 0);
                const ledger = new Prisma.Decimal(row.ledger ?? 0);
                const diff =
                    row.diff !== undefined
                        ? new Prisma.Decimal(row.diff)
                        : live.minus(ledger);
                if (diff.isZero()) continue;
                mapped.push({
                    item: {
                        productVariantId: row.productVariantId,
                        locationId: row.locationId,
                        skuCode: row.skuCode,
                        locationName: row.locationName,
                        live: live.toString(),
                        ledger: ledger.toString(),
                        diff: diff.toString(),
                    },
                    absDiff: diff.abs(),
                });
            }

            mapped.sort((a, b) => {
                const diffOrder = b.absDiff.comparedTo(a.absDiff);
                if (diffOrder !== 0) return diffOrder;
                const skuOrder = a.item.skuCode.localeCompare(b.item.skuCode);
                if (skuOrder !== 0) return skuOrder;
                return a.item.locationName.localeCompare(b.item.locationName);
            });

            let roundingCount = 0;
            let materialCount = 0;
            for (const entry of mapped) {
                if (entry.absDiff.lt(MATERIAL_DIFF_THRESHOLD)) {
                    roundingCount += 1;
                } else {
                    materialCount += 1;
                }
            }

            const mismatches = mapped.map((entry) => entry.item);
            return {
                mismatches,
                roundingCount,
                materialCount,
                findings: mismatches.length,
            };
        },
        {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            timeout: HEALTH_TX_TIMEOUT_MS,
        },
    );
}

/**
 * Read-only movement history for a single (productVariantId, locationId) pair,
 * ordered by createdAt, id with signed delta and running ledger balance.
 * When movements exceed `limit`, returns the newest `limit` rows while anchoring
 * the running balance to the sum of all movements before the window.
 */
export async function getStockLedgerPairHistory(
    productVariantId: string,
    locationId: string,
    limit = 200,
): Promise<StockLedgerPairHistory> {
    const safeLimit = Math.max(1, Math.floor(limit));
    return prisma.$transaction(
        async (tx) => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            const [inventory, rawMovements] = await Promise.all([
                tx.inventory.findUnique({
                    where: {
                        locationId_productVariantId: {
                            locationId,
                            productVariantId,
                        },
                    },
                    select: { quantity: true },
                }),
                tx.stockMovement.findMany({
                    where: {
                        productVariantId,
                        OR: [
                            { fromLocationId: locationId },
                            { toLocationId: locationId },
                        ],
                    },
                    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                    select: {
                        id: true,
                        createdAt: true,
                        type: true,
                        reference: true,
                        quantity: true,
                        fromLocationId: true,
                        toLocationId: true,
                    },
                }),
            ]);

            const zero = new Prisma.Decimal(0);
            let running = zero;
            let firstNegative: StockLedgerPairMovement | null = null;
            const allEntries: StockLedgerPairMovement[] = [];

            for (const row of rawMovements) {
                const qty = new Prisma.Decimal(row.quantity ?? 0);
                const inQty = row.toLocationId === locationId ? qty : zero;
                const outQty = row.fromLocationId === locationId ? qty : zero;
                const delta = inQty.minus(outQty);
                running = running.plus(delta);

                const entry: StockLedgerPairMovement = {
                    id: row.id,
                    createdAt:
                        row.createdAt instanceof Date
                            ? row.createdAt.toISOString()
                            : String(row.createdAt),
                    type: String(row.type),
                    reference: row.reference ?? null,
                    inQuantity: inQty.toString(),
                    outQuantity: outQty.toString(),
                    delta: delta.toString(),
                    runningBalance: running.toString(),
                };
                if (!firstNegative && running.isNegative()) {
                    firstNegative = entry;
                }
                allEntries.push(entry);
            }

            const live = new Prisma.Decimal(inventory?.quantity ?? 0);
            const ledger = running;
            const diff = live.minus(ledger);
            const truncated = allEntries.length > safeLimit;
            const windowStart = truncated
                ? allEntries.length - safeLimit
                : 0;
            const openingBalance =
                windowStart > 0
                    ? allEntries[windowStart - 1].runningBalance
                    : '0';
            const movements = truncated
                ? allEntries.slice(windowStart)
                : allEntries;

            return {
                productVariantId,
                locationId,
                live: live.toString(),
                ledger: ledger.toString(),
                diff: diff.toString(),
                openingBalance,
                truncated,
                totalMovements: allEntries.length,
                firstNegative,
                movements,
            };
        },
        {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            timeout: HEALTH_TX_TIMEOUT_MS,
        },
    );
}

/** One line per tenant; "check failed" lets the existing error-log monitor alert ops. */
export function summarizeStockLedgerHealth(
    tenant: string,
    health: StockLedgerHealth,
): string {
    if (health.mismatches.length === 0) {
        return `[StockLedgerHealth] ${tenant}: ok`;
    }
    const sorted = [...health.mismatches].sort((a, b) =>
        new Prisma.Decimal(b.diff)
            .abs()
            .comparedTo(new Prisma.Decimal(a.diff).abs()),
    );
    const listed = sorted
        .slice(0, MAX_SUMMARY_ITEMS)
        .map((m) => `${m.skuCode}@${m.locationName} ${m.diff}`);
    const remaining = sorted.length - listed.length;
    if (remaining > 0) {
        listed.push(`+${remaining} lainnya`);
    }
    return `[StockLedgerHealth] check failed for ${tenant}: ${sorted.length} pasangan saldo≠kartu stok (${health.roundingCount} pembulatan, ${health.materialCount} material) — ${listed.join(', ')}`;
}
