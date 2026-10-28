import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { ApplicationError } from '@/lib/errors/errors';
import { availableProductionWip } from '@/services/accounting/production-wip-provenance';
import { readCostPeriod } from '@/services/accounting/production-cost-period';
import { skuInventoryBasis } from '@/services/inventory/internal-usage-accounting';

// Daily cron: report what changed in the last day, not every legacy record.
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
// Sub-rupiah residue is cent rounding from the legacy average rule, not a defect.
const VALUE_TOLERANCE = new Prisma.Decimal('1');
const HEALTH_TX_TIMEOUT_MS = 60_000;
// Voids are usually re-entered within minutes; an older void still pairs with today's re-entry.
const VOID_LOOKBACK_MS = 7 * RECENT_WINDOW_MS;
// Differences below this are input rounding, not a missing quantity.
const QUANTITY_TOLERANCE = new Prisma.Decimal('0.0001');

export interface ProductionCostHealth {
    /** Active WOs whose next output the WIP guard rejects. */
    blockedOrders: Array<{ orderNumber: string; reason: string }>;
    /** WOs completed in the last day still holding posted WIP no output relieved. */
    completedResidual: Array<{ orderNumber: string; residual: string }>;
    /** Active WOs with legacy NULL-cost, unjournaled affal (normalizer candidates). */
    nullCostScrapOrders: string[];
    /** Production movements written in the last 24h without a cost (journal priced by fallback). */
    uncostedMovements: Array<{ type: string; count: number }>;
    /** Company output posted at Rp0 in the last 24h: no remaining WO cost to relieve. */
    zeroCostOutputs: Array<{ orderNumber: string; skuCode: string; quantity: string }>;
    /** Stocked ATK whose stock value no SKU-linked journal funds. */
    operationalWithoutBasis: Array<{ skuCode: string; stockValue: string; basis: string }>;
    /** Re-entries of a voided output in the last 24h with no less output but less affal or material. */
    revisionShortfalls: Array<{ orderNumber: string; changes: string[] }>;
    /** Non-affal stock adjusted in during the last 24h at Rp0: no entered, average, standard or buy cost. */
    zeroCostAdjustments: Array<{ skuCode: string; quantity: string }>;
    /** Explicitly retained historical WIP; NOT available to future production. */
    retainedHistory?: Array<{ orderNumber: string; amount: string }>;
    findings: number;
}

type Tx = Prisma.TransactionClient;

async function inspectWipPools(tx: Tx, now: Date) {
    const orders = await tx.productionOrder.findMany({
        where: {
            isMaklon: false, actualPackagingEnabled: false,
            OR: [
                { status: { in: ['RELEASED', 'IN_PROGRESS'] } },
                { status: 'COMPLETED', updatedAt: { gte: new Date(now.getTime() - RECENT_WINDOW_MS) } },
            ],
            stockMovements: { some: {} },
        },
        select: { id: true, orderNumber: true, status: true },
        orderBy: { orderNumber: 'asc' },
    });
    const blockedOrders: ProductionCostHealth['blockedOrders'] = [];
    const completedResidual: ProductionCostHealth['completedResidual'] = [];
    const retainedHistory: NonNullable<ProductionCostHealth['retainedHistory']> = [];
    for (const order of orders) {
        try {
            const residual = await availableProductionWip(tx, order.id, { lock: false });
            const period = await readCostPeriod(tx, order.id);
            if (period) retainedHistory.push({ orderNumber: order.orderNumber, amount: period.historicalBalances.reduce((s,b)=>s.plus(b.amount), new Prisma.Decimal(0)).toFixed(2) });
            if (order.status === 'COMPLETED' && residual.gt(VALUE_TOLERANCE)) {
                completedResidual.push({ orderNumber: order.orderNumber, residual: residual.toFixed(2) });
            }
        } catch (error) {
            if (!(error instanceof ApplicationError) || !['PRODUCTION_WIP_UNRESOLVED', 'PRODUCTION_COST_PERIOD_INVALID'].includes(error.code)) throw error;
            // A completed WO takes no more output; its legacy history is WS4 scope.
            if (order.status === 'COMPLETED') continue;
            blockedOrders.push({ orderNumber: order.orderNumber, reason: String(error.details?.reason ?? error.message) });
        }
    }
    return { blockedOrders, completedResidual, retainedHistory };
}

async function findNullCostScrapOrders(tx: Tx) {
    const rows = await tx.$queryRaw<Array<{ orderNumber: string }>>`
        SELECT DISTINCT o."orderNumber" FROM "ProductionOrder" o
        JOIN "StockMovement" m ON m."productionOrderId" = o.id
        JOIN "ProductVariant" v ON v.id = m."productVariantId" JOIN "Product" p ON p.id = v."productId"
        WHERE o.status::text IN ('RELEASED', 'IN_PROGRESS') AND m.type = 'IN' AND p."productType" = 'SCRAP'
          AND m.cost IS NULL AND NOT EXISTS (SELECT 1 FROM "JournalEntry" j WHERE j."referenceId" = m.id)
        ORDER BY o."orderNumber"`;
    return rows.map((row) => row.orderNumber);
}

async function countUncostedMovements(tx: Tx, now: Date) {
    const rows = await tx.stockMovement.groupBy({
        by: ['type'],
        // Stock IN/OUT post production journals; a TRANSFER to the WO location does not.
        where: {
            productionOrderId: { not: null }, type: { in: ['IN', 'OUT'] }, cost: null,
            createdAt: { gte: new Date(now.getTime() - RECENT_WINDOW_MS) },
        },
        _count: { _all: true },
    });
    return rows.map((row) => ({ type: row.type, count: row._count._all }));
}

async function findZeroCostOutputs(tx: Tx, now: Date) {
    const rows = await tx.$queryRaw<Array<{ orderNumber: string; skuCode: string; quantity: Prisma.Decimal }>>`
        SELECT o."orderNumber", v."skuCode", SUM(m.quantity) AS quantity
        FROM "StockMovement" m JOIN "ProductionOrder" o ON o.id = m."productionOrderId"
        JOIN "ProductVariant" v ON v.id = m."productVariantId" JOIN "Product" p ON p.id = v."productId"
        WHERE m.type = 'IN' AND m.cost = 0 AND m."reversalOfId" IS NULL AND NOT o."isMaklon"
          AND p."productType" <> 'SCRAP' AND m."createdAt" >= ${new Date(now.getTime() - RECENT_WINDOW_MS)}
        GROUP BY o."orderNumber", v."skuCode" ORDER BY o."orderNumber", v."skuCode"`;
    return rows.map((row) => ({ orderNumber: row.orderNumber, skuCode: row.skuCode, quantity: new Prisma.Decimal(row.quantity).toString() }));
}

async function findOperationalWithoutBasis(tx: Tx) {
    const stocked = await tx.$queryRaw<Array<{ id: string; skuCode: string; stockValue: Prisma.Decimal }>>`
        SELECT v.id, v."skuCode", COALESCE(SUM(i.quantity * COALESCE(i."averageCost", 0)), 0) AS "stockValue"
        FROM "Inventory" i JOIN "ProductVariant" v ON v.id = i."productVariantId" JOIN "Product" p ON p.id = v."productId"
        WHERE p."productType" = 'OPERATIONAL' AND i.quantity > 0
        GROUP BY v.id, v."skuCode" ORDER BY v."skuCode"`;
    const gaps: ProductionCostHealth['operationalWithoutBasis'] = [];
    for (const sku of stocked) {
        const stockValue = new Prisma.Decimal(sku.stockValue);
        const basis = [...(await skuInventoryBasis(tx, sku.id)).values()]
            .reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
        if (!stockValue.gt(0) || basis.lt(stockValue.minus(VALUE_TOLERANCE))) {
            gaps.push({ skuCode: sku.skuCode, stockValue: stockValue.toFixed(2), basis: basis.toFixed(2) });
        }
    }
    return gaps;
}

type RevisionRow = {
    orderNumber: string;
    affal: Prisma.Decimal;
    revisedAffal: Prisma.Decimal;
    materials: Array<{ skuCode: string; before: number; after: number }> | null;
};
const qty = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value).toString();

async function findRevisionShortfalls(tx: Tx, now: Date) {
    // Each void pairs with the next entry on its WO; a dropped affal leaves its material in stock.
    // Affal total is max(generic, prongkol + daun), as in executionScrapTotal. Only packaged
    // entries link their material movements, so other entries compare affal alone.
    const rows = await tx.$queryRaw<RevisionRow[]>`
        WITH voided AS (
            SELECT e.id, e."productionOrderId" AS oid, e."updatedAt" AS voided_at, e."quantityProduced" AS qty,
                GREATEST(e."scrapQuantity", e."scrapProngkolQty" + e."scrapDaunQty") AS affal
            FROM "ProductionExecution" e
            WHERE e.status = 'VOIDED' AND e."updatedAt" >= ${new Date(now.getTime() - VOID_LOOKBACK_MS)}
        ), pairs AS (
            SELECT v.*, r.id AS rid, GREATEST(r."scrapQuantity", r."scrapProngkolQty" + r."scrapDaunQty") AS revised_affal
            FROM voided v CROSS JOIN LATERAL (
                SELECT x.* FROM "ProductionExecution" x
                WHERE x."productionOrderId" = v.oid AND x.id <> v.id AND x."createdAt" >= v.voided_at
                ORDER BY x."createdAt", x.id LIMIT 1
            ) r
            WHERE r.status <> 'VOIDED' AND r."createdAt" >= ${new Date(now.getTime() - RECENT_WINDOW_MS)}
              AND r."quantityProduced" >= v.qty
        ), used AS (
            SELECT m."productionExecutionId" AS eid, m."productVariantId" AS vid, SUM(m.quantity) AS qty
            FROM "StockMovement" m
            WHERE m.type = 'OUT' AND m."reversalOfId" IS NULL
              AND m."productionExecutionId" IN (SELECT id FROM pairs UNION SELECT rid FROM pairs)
            GROUP BY 1, 2
        ), drops AS (
            SELECT p.id, json_agg(json_build_object('skuCode', v."skuCode", 'before', b.qty, 'after', COALESCE(a.qty, 0))
                ORDER BY v."skuCode") AS materials
            FROM pairs p JOIN used b ON b.eid = p.id
            LEFT JOIN used a ON a.eid = p.rid AND a.vid = b.vid
            JOIN "ProductVariant" v ON v.id = b.vid
            WHERE COALESCE(a.qty, 0) < b.qty - ${QUANTITY_TOLERANCE}::numeric
            GROUP BY p.id
        )
        SELECT o."orderNumber", p.affal, p.revised_affal AS "revisedAffal", d.materials
        FROM pairs p JOIN "ProductionOrder" o ON o.id = p.oid LEFT JOIN drops d ON d.id = p.id
        WHERE p.revised_affal < p.affal - ${QUANTITY_TOLERANCE}::numeric OR d.materials IS NOT NULL
        ORDER BY o."orderNumber", p.voided_at`;
    return rows.map((row) => {
        const droppedAffal = new Prisma.Decimal(row.revisedAffal).lt(new Prisma.Decimal(row.affal).minus(QUANTITY_TOLERANCE));
        return {
            orderNumber: row.orderNumber,
            changes: [
                ...(droppedAffal ? [`affal ${qty(row.affal)} → ${qty(row.revisedAffal)} kg`] : []),
                ...(row.materials ?? []).map((m) => `${m.skuCode} ${qty(m.before)} → ${qty(m.after)}`),
            ],
        };
    });
}

async function findZeroCostAdjustments(tx: Tx, now: Date) {
    // Affal enters at Rp0 by policy (full absorption); anything else needs a price from Finance.
    const rows = await tx.$queryRaw<Array<{ skuCode: string; quantity: Prisma.Decimal }>>`
        SELECT v."skuCode", SUM(m.quantity) AS quantity
        FROM "StockMovement" m JOIN "ProductVariant" v ON v.id = m."productVariantId" JOIN "Product" p ON p.id = v."productId"
        WHERE m.type = 'ADJUSTMENT' AND m."toLocationId" IS NOT NULL AND m.cost = 0 AND p."productType" <> 'SCRAP'
          AND m."createdAt" >= ${new Date(now.getTime() - RECENT_WINDOW_MS)}
        GROUP BY v."skuCode" ORDER BY v."skuCode"`;
    return rows.map((row) => ({ skuCode: row.skuCode, quantity: qty(row.quantity) }));
}

/**
 * Read-only daily detection for the current tenant: surfaces costing problems
 * within a day instead of when an operator is blocked. One READ ONLY
 * transaction; it takes no row locks and writes nothing.
 */
export async function checkProductionCostHealth(now = new Date()): Promise<ProductionCostHealth> {
    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const { blockedOrders, completedResidual, retainedHistory } = await inspectWipPools(tx, now);
        const nullCostScrapOrders = await findNullCostScrapOrders(tx);
        const uncostedMovements = await countUncostedMovements(tx, now);
        const zeroCostOutputs = await findZeroCostOutputs(tx, now);
        const operationalWithoutBasis = await findOperationalWithoutBasis(tx);
        const revisionShortfalls = await findRevisionShortfalls(tx, now);
        const zeroCostAdjustments = await findZeroCostAdjustments(tx, now);
        const findings = blockedOrders.length + completedResidual.length + nullCostScrapOrders.length +
            uncostedMovements.reduce((sum, row) => sum + row.count, 0) + zeroCostOutputs.length + operationalWithoutBasis.length +
            revisionShortfalls.length + zeroCostAdjustments.length + retainedHistory.length;
        return { blockedOrders, completedResidual, retainedHistory, nullCostScrapOrders, uncostedMovements, zeroCostOutputs, operationalWithoutBasis,
            revisionShortfalls, zeroCostAdjustments, findings };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: HEALTH_TX_TIMEOUT_MS });
}

/** One line per tenant; "check failed" lets the existing error-log monitor alert ops. */
export function summarizeProductionCostHealth(tenant: string, health: ProductionCostHealth) {
    if (health.findings === 0) return `[ProductionCostHealth] ${tenant}: ok`;
    const parts = [
        health.retainedHistory?.length && `biaya historis dipertahankan, bukan dana hasil baru (${health.retainedHistory.map(o=>`${o.orderNumber} Rp${o.amount}`).join(', ')})`,
        health.blockedOrders.length && `${health.blockedOrders.length} SPK terblokir (${health.blockedOrders.map((o) => `${o.orderNumber}: ${o.reason}`).join('; ')})`,
        health.completedResidual.length && `${health.completedResidual.length} SPK selesai bersisa WIP (${health.completedResidual.map((o) => `${o.orderNumber} Rp${o.residual}`).join(', ')})`,
        health.nullCostScrapOrders.length && `${health.nullCostScrapOrders.length} SPK affal NULL (${health.nullCostScrapOrders.join(', ')})`,
        health.uncostedMovements.length && `movement produksi tanpa biaya 24 jam: ${health.uncostedMovements.map((m) => `${m.type} ${m.count}`).join(', ')}`,
        health.zeroCostOutputs.length && `hasil bernilai Rp0 24 jam (${health.zeroCostOutputs.map((o) => `${o.orderNumber} ${o.skuCode} ${o.quantity}`).join('; ')})`,
        health.operationalWithoutBasis.length && `${health.operationalWithoutBasis.length} SKU ATK tanpa basis (${health.operationalWithoutBasis.map((s) => s.skuCode).join(', ')})`,
        health.revisionShortfalls.length && `${health.revisionShortfalls.length} revisi SPK mengurangi affal/bahan dari isian yang di-void (${health.revisionShortfalls.map((r) => `${r.orderNumber}: ${r.changes.join(', ')}`).join('; ')})`,
        health.zeroCostAdjustments.length && `penyesuaian masuk Rp0 tanpa sumber harga 24 jam (${health.zeroCostAdjustments.map((a) => `${a.skuCode} ${a.quantity}`).join('; ')})`,
    ].filter(Boolean);
    return `[ProductionCostHealth] check failed for ${tenant}: ${health.findings} temuan — ${parts.join(' | ')}`;
}
