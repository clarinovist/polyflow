import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { collectFinanceJournalIssues } from '@/services/finance/journal-health-service';
import type { DetectedItem, DetectionResult } from './detection-types';

// Safety cap on rows fetched per detector. Not a display limit (that lives in
// format.ts) — this only guards against pathological result sets. If a run
// hits it, status is 'truncated' so callers (auto-resolve in particular) know
// not to trust "item disappeared" as "item resolved" for this run.
const FETCH_CAP = 500;

function buildResult(
    detector: string,
    requiredResources: string[],
    items: DetectedItem[],
    hitCap: boolean,
): DetectionResult {
    return {
        detector,
        status: hitCap ? 'truncated' : 'ok',
        requiredResources,
        items,
    };
}

function failedResult(
    detector: string,
    requiredResources: string[],
    error: unknown,
): DetectionResult {
    return {
        detector,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        requiredResources,
        items: [],
    };
}

type CriticalStockRow = {
    productId: string;
    product: string;
    qty: Prisma.Decimal;
    threshold: Prisma.Decimal;
};

export async function detectCriticalStock(
    tenantDb: PrismaClient,
): Promise<DetectionResult> {
    const requiredResources = ['/warehouse/inventory'];
    try {
        const rows = await tenantDb.$queryRaw<CriticalStockRow[]>(Prisma.sql`
      SELECT p.id AS "productId", p.name AS product, SUM(i.quantity) AS qty, SUM(pv."minStockAlert") AS threshold
      FROM "Inventory" i
      JOIN "ProductVariant" pv ON i."productVariantId" = pv.id
      JOIN "Product" p ON pv."productId" = p.id
      GROUP BY p.id, p.name
      HAVING SUM(i.quantity) < SUM(pv."minStockAlert") AND SUM(pv."minStockAlert") > 0
      ORDER BY qty ASC
      LIMIT ${FETCH_CAP}
    `);

        const items: DetectedItem[] = rows.map((row) => ({
            entityKey: `critical_stock:${row.productId}`,
            entityType: 'Product',
            entityId: row.productId,
            severity: 'critical',
            headline: `${row.product}: ${Number(row.qty).toFixed(0)} < ${Number(row.threshold).toFixed(0)}`,
        }));

        return buildResult(
            'critical_stock',
            requiredResources,
            items,
            rows.length === FETCH_CAP,
        );
    } catch (error) {
        return failedResult('critical_stock', requiredResources, error);
    }
}

export async function detectStuckSalesOrders(
    tenantDb: PrismaClient,
): Promise<DetectionResult> {
    const requiredResources = ['/sales/orders'];
    try {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 3);

        const rows = await tenantDb.salesOrder.findMany({
            where: {
                status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP'] },
                orderDate: { lt: threshold },
            },
            select: {
                id: true,
                orderNumber: true,
                customer: { select: { name: true } },
                orderDate: true,
            },
            orderBy: { orderDate: 'asc' },
            take: FETCH_CAP,
        });

        const items: DetectedItem[] = rows.map((row) => {
            const daysSince = Math.floor(
                (Date.now() - row.orderDate.getTime()) / 86_400_000,
            );
            return {
                entityKey: `stuck_so:${row.id}`,
                entityType: 'SalesOrder',
                entityId: row.id,
                severity: 'warning',
                headline: `${row.orderNumber} — ${row.customer?.name || 'Guest'}`,
                detail: `${daysSince} hari sejak order, belum selesai`,
            };
        });

        return buildResult(
            'stuck_so',
            requiredResources,
            items,
            rows.length === FETCH_CAP,
        );
    } catch (error) {
        return failedResult('stuck_so', requiredResources, error);
    }
}

type OverdueArRow = {
    invoiceId: string;
    invoiceNumber: string;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    dueDate: Date | null;
    soNumber: string | null;
};

export async function detectOverdueAr(
    tenantDb: PrismaClient,
): Promise<DetectionResult> {
    const requiredResources = ['/finance/invoices'];
    try {
        const rows = await tenantDb.$queryRaw<OverdueArRow[]>(Prisma.sql`
      SELECT i.id AS "invoiceId", i."invoiceNumber", i."totalAmount", i."paidAmount", i."dueDate",
             so."orderNumber" AS "soNumber"
      FROM "Invoice" i
      LEFT JOIN "SalesOrder" so ON i."salesOrderId" = so.id
      WHERE i."dueDate" < NOW()
        AND i.status IN ('UNPAID', 'PARTIAL')
      ORDER BY i."dueDate" ASC
      LIMIT ${FETCH_CAP}
    `);

        const items: DetectedItem[] = rows.map((row) => {
            const outstanding =
                Number(row.totalAmount) - Number(row.paidAmount);
            return {
                entityKey: `overdue_ar:${row.invoiceId}`,
                entityType: 'Invoice',
                entityId: row.invoiceId,
                severity: 'critical',
                headline: `Invoice ${row.invoiceNumber} (SO: ${row.soNumber || '-'})`,
                detail: `Jatuh tempo, sisa Rp ${outstanding.toLocaleString('id-ID')}`,
            };
        });

        return buildResult(
            'overdue_ar',
            requiredResources,
            items,
            rows.length === FETCH_CAP,
        );
    } catch (error) {
        return failedResult('overdue_ar', requiredResources, error);
    }
}

type OverdueApRow = {
    invoiceId: string;
    invoiceNumber: string;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    dueDate: Date | null;
    poNumber: string | null;
};

export async function detectOverdueAp(
    tenantDb: PrismaClient,
): Promise<DetectionResult> {
    const requiredResources = ['/purchasing/invoices'];
    try {
        const rows = await tenantDb.$queryRaw<OverdueApRow[]>(Prisma.sql`
      SELECT pi.id AS "invoiceId", pi."invoiceNumber", pi."totalAmount", pi."paidAmount", pi."dueDate",
             po."orderNumber" AS "poNumber"
      FROM "PurchaseInvoice" pi
      LEFT JOIN "PurchaseOrder" po ON pi."purchaseOrderId" = po.id
      WHERE pi."dueDate" < NOW()
        AND pi.status IN ('UNPAID', 'PARTIAL')
      ORDER BY pi."dueDate" ASC
      LIMIT ${FETCH_CAP}
    `);

        const items: DetectedItem[] = rows.map((row) => {
            const outstanding =
                Number(row.totalAmount) - Number(row.paidAmount);
            return {
                entityKey: `overdue_ap:${row.invoiceId}`,
                entityType: 'PurchaseInvoice',
                entityId: row.invoiceId,
                severity: 'critical',
                headline: `Invoice ${row.invoiceNumber} (PO: ${row.poNumber || '-'})`,
                detail: `Jatuh tempo, sisa Rp ${outstanding.toLocaleString('id-ID')}`,
            };
        });

        return buildResult(
            'overdue_ap',
            requiredResources,
            items,
            rows.length === FETCH_CAP,
        );
    } catch (error) {
        return failedResult('overdue_ap', requiredResources, error);
    }
}

type ProductionNoProgressRow = {
    id: string;
    orderNumber: string | null;
    lastActivity: Date;
    hoursSince: number;
};

export async function detectProductionNoProgress(
    tenantDb: PrismaClient,
): Promise<DetectionResult> {
    const requiredResources = ['/production/orders'];
    try {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - 24);

        const rows = await tenantDb.$queryRaw<
            ProductionNoProgressRow[]
        >(Prisma.sql`
      SELECT po.id, po."orderNumber",
             COALESCE(MAX(pe."startTime"), po."plannedStartDate", po."createdAt") AS "lastActivity",
             EXTRACT(EPOCH FROM (NOW() - COALESCE(MAX(pe."startTime"), po."plannedStartDate", po."createdAt"))) / 3600 AS "hoursSince"
      FROM "ProductionOrder" po
      LEFT JOIN "ProductionExecution" pe
        ON pe."productionOrderId" = po.id
        AND pe.status <> 'VOIDED'
      WHERE po.status IN ('RELEASED', 'IN_PROGRESS')
      GROUP BY po.id, po."orderNumber", po."plannedStartDate", po."createdAt"
      HAVING COALESCE(MAX(pe."startTime"), po."plannedStartDate", po."createdAt") < ${cutoff}
      ORDER BY "lastActivity" ASC
      LIMIT ${FETCH_CAP}
    `);

        const items: DetectedItem[] = rows.map((row) => ({
            entityKey: `production_no_progress:${row.id}`,
            entityType: 'ProductionOrder',
            entityId: row.id,
            severity: 'warning',
            headline: `SPK ${row.orderNumber || row.id.slice(0, 8)}`,
            detail: `${Math.floor(row.hoursSince)} jam tanpa progres`,
        }));

        return buildResult(
            'production_no_progress',
            requiredResources,
            items,
            rows.length === FETCH_CAP,
        );
    } catch (error) {
        return failedResult('production_no_progress', requiredResources, error);
    }
}

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

/**
 * Documents that should carry a finance journal but don't (or whose AR leg is
 * short of the document amount). These are exactly the silent auto-journal
 * failures that produced the recap-vs-balance-sheet drift diagnosed in the
 * 2026-08-31 local plan (docs/plan/ — gitignored).
 */
export async function detectMissingFinanceJournals(
    tenantDb: PrismaClient,
): Promise<DetectionResult> {
    const requiredResources = ['/finance/journals'];
    try {
        const issues = await collectFinanceJournalIssues(tenantDb);
        const items: DetectedItem[] = [];

        for (const inv of issues.salesInvoicesMissing) {
            items.push({
                entityKey: `missing_finance_journal:SALES_INVOICE:${inv.id}`,
                entityType: 'Invoice',
                entityId: inv.id,
                severity: 'critical',
                headline: `Invoice ${inv.invoiceNumber} tanpa jurnal AR`,
                detail: `${rupiah(inv.totalAmount)} — ${inv.customerName ?? 'Tanpa customer'}`,
            });
        }
        for (const s of issues.salesInvoiceShortfalls) {
            items.push({
                entityKey: `missing_finance_journal:SALES_INVOICE_SHORTFALL:${s.id}`,
                entityType: 'Invoice',
                entityId: s.id,
                severity: 'critical',
                headline: `Invoice ${s.invoiceNumber} jurnal AR kurang`,
                detail: `Dibukukan ${rupiah(s.arDebit)} dari ${rupiah(s.totalAmount)} (kurang ${rupiah(s.difference)})`,
            });
        }
        for (const p of issues.salesPaymentsMissing) {
            items.push({
                entityKey: `missing_finance_journal:SALES_PAYMENT:${p.id}`,
                entityType: 'Payment',
                entityId: p.id,
                severity: 'critical',
                headline: `Payment pelanggan ${p.paymentNumber ?? p.id.slice(0, 8)} tanpa jurnal`,
                detail: `${rupiah(p.amount)} — ${p.method ?? 'metode tidak dicatat'}`,
            });
        }
        for (const inv of issues.purchaseInvoicesMissing) {
            items.push({
                entityKey: `missing_finance_journal:PURCHASE_INVOICE:${inv.id}`,
                entityType: 'PurchaseInvoice',
                entityId: inv.id,
                severity: 'critical',
                headline: `Invoice pembelian ${inv.invoiceNumber} tanpa jurnal AP`,
                detail: `${rupiah(inv.totalAmount)} — status ${inv.status}`,
            });
        }
        for (const p of issues.purchasePaymentsMissing) {
            items.push({
                entityKey: `missing_finance_journal:PURCHASE_PAYMENT:${p.id}`,
                entityType: 'Payment',
                entityId: p.id,
                severity: 'critical',
                headline: `Payment supplier ${p.paymentNumber ?? p.id.slice(0, 8)} tanpa jurnal`,
                detail: `${rupiah(p.amount)} — ${p.method ?? 'metode tidak dicatat'}`,
            });
        }

        const capped = items.slice(0, FETCH_CAP);
        return buildResult(
            'missing_finance_journal',
            requiredResources,
            capped,
            items.length >= FETCH_CAP,
        );
    } catch (error) {
        return failedResult('missing_finance_journal', requiredResources, error);
    }
}
