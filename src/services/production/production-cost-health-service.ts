import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { ApplicationError } from '@/lib/errors/errors';
import { availableProductionWip } from '@/services/accounting/production-wip-provenance';
import { skuInventoryBasis } from '@/services/inventory/internal-usage-accounting';

// Daily cron: report what changed in the last day, not every legacy record.
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
// Sub-rupiah residue is cent rounding from the legacy average rule, not a defect.
const VALUE_TOLERANCE = new Prisma.Decimal('1');
const HEALTH_TX_TIMEOUT_MS = 60_000;

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
    for (const order of orders) {
        try {
            const residual = await availableProductionWip(tx, order.id, { lock: false });
            if (order.status === 'COMPLETED' && residual.gt(VALUE_TOLERANCE)) {
                completedResidual.push({ orderNumber: order.orderNumber, residual: residual.toFixed(2) });
            }
        } catch (error) {
            if (!(error instanceof ApplicationError) || error.code !== 'PRODUCTION_WIP_UNRESOLVED') throw error;
            // A completed WO takes no more output; its legacy history is WS4 scope.
            if (order.status === 'COMPLETED') continue;
            blockedOrders.push({ orderNumber: order.orderNumber, reason: String(error.details?.reason ?? error.message) });
        }
    }
    return { blockedOrders, completedResidual };
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

/**
 * Read-only daily detection for the current tenant: surfaces costing problems
 * within a day instead of when an operator is blocked. One READ ONLY
 * transaction; it takes no row locks and writes nothing.
 */
export async function checkProductionCostHealth(now = new Date()): Promise<ProductionCostHealth> {
    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const { blockedOrders, completedResidual } = await inspectWipPools(tx, now);
        const nullCostScrapOrders = await findNullCostScrapOrders(tx);
        const uncostedMovements = await countUncostedMovements(tx, now);
        const zeroCostOutputs = await findZeroCostOutputs(tx, now);
        const operationalWithoutBasis = await findOperationalWithoutBasis(tx);
        const findings = blockedOrders.length + completedResidual.length + nullCostScrapOrders.length +
            uncostedMovements.reduce((sum, row) => sum + row.count, 0) + zeroCostOutputs.length + operationalWithoutBasis.length;
        return { blockedOrders, completedResidual, nullCostScrapOrders, uncostedMovements, zeroCostOutputs, operationalWithoutBasis, findings };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: HEALTH_TX_TIMEOUT_MS });
}

/** One line per tenant; "check failed" lets the existing error-log monitor alert ops. */
export function summarizeProductionCostHealth(tenant: string, health: ProductionCostHealth) {
    if (health.findings === 0) return `[ProductionCostHealth] ${tenant}: ok`;
    const parts = [
        health.blockedOrders.length && `${health.blockedOrders.length} SPK terblokir (${health.blockedOrders.map((o) => `${o.orderNumber}: ${o.reason}`).join('; ')})`,
        health.completedResidual.length && `${health.completedResidual.length} SPK selesai bersisa WIP (${health.completedResidual.map((o) => `${o.orderNumber} Rp${o.residual}`).join(', ')})`,
        health.nullCostScrapOrders.length && `${health.nullCostScrapOrders.length} SPK affal NULL (${health.nullCostScrapOrders.join(', ')})`,
        health.uncostedMovements.length && `movement produksi tanpa biaya 24 jam: ${health.uncostedMovements.map((m) => `${m.type} ${m.count}`).join(', ')}`,
        health.zeroCostOutputs.length && `hasil bernilai Rp0 24 jam (${health.zeroCostOutputs.map((o) => `${o.orderNumber} ${o.skuCode} ${o.quantity}`).join('; ')})`,
        health.operationalWithoutBasis.length && `${health.operationalWithoutBasis.length} SKU ATK tanpa basis (${health.operationalWithoutBasis.map((s) => s.skuCode).join(', ')})`,
    ].filter(Boolean);
    return `[ProductionCostHealth] check failed for ${tenant}: ${health.findings} temuan — ${parts.join(' | ')}`;
}
