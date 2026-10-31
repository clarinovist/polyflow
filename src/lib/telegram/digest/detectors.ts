import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { collectFinanceJournalIssues } from '@/services/finance/journal-health-service';
import { collectBarterHealth } from '@/services/finance/barter-health-service';
import type { DetectedItem, DetectionResult } from './detection-types';
import { detectorResources } from '@/lib/findings/detector-catalog';
import { isLowStockAlertLocation } from '@/lib/constants/locations';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';

// Safety cap on rows fetched per detector. Not a display limit (that lives in
// format.ts) — this only guards against pathological result sets. If a run
// hits it, status is 'truncated' so callers (auto-resolve in particular) know
// not to trust "item disappeared" as "item resolved" for this run.
const FETCH_CAP = 500;

// Severity policy: docs/plan/2026-10-31-finding-digest.md §6 K2.
const OVERDUE_CRITICAL_DAYS = 30;
const LOW_STOCK_CRITICAL_RATIO = 0.5;
const MS_PER_DAY = 86_400_000;

export function daysOverdue(dueDate: Date | null, now: Date): number {
    if (!dueDate) return 0;
    return Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / MS_PER_DAY));
}

export function overdueSeverity(days: number): DetectedItem['severity'] {
    return days > OVERDUE_CRITICAL_DAYS ? 'critical' : 'warning';
}

const formatQty = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });

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

/**
 * Same business definition as the legacy LOW_STOCK producer
 * (InventoryCoreService.checkLowStockTriggers): per variant, only internal
 * RAW_MATERIAL/FINISHED_GOOD locations count, and 0 < qty < minStockAlert.
 */
export async function detectCriticalStock(
    tenantDb: PrismaClient,
): Promise<DetectionResult> {
    const requiredResources = detectorResources('critical_stock');
    try {
        const variants = await tenantDb.productVariant.findMany({
            where: { minStockAlert: { not: null }, archivedAt: null },
            select: {
                id: true,
                name: true,
                minStockAlert: true,
                inventories: {
                    select: {
                        quantity: true,
                        location: { select: { locationType: true, locationPurpose: true } },
                    },
                },
            },
            orderBy: { id: 'asc' },
            take: FETCH_CAP,
        });

        const items: DetectedItem[] = [];
        for (const variant of variants) {
            const threshold = Number(variant.minStockAlert ?? 0);
            const qty = variant.inventories
                .filter((inv) => isLowStockAlertLocation(inv.location))
                .reduce((sum, inv) => sum + Number(inv.quantity), 0);
            if (!(qty > 0 && qty < threshold)) continue;
            items.push({
                entityKey: `critical_stock:${variant.id}`,
                entityType: 'ProductVariant',
                entityId: variant.id,
                severity: qty <= threshold * LOW_STOCK_CRITICAL_RATIO ? 'critical' : 'warning',
                headline: `${variant.name}: ${formatQty(qty)} < ${formatQty(threshold)}`,
            });
        }

        return buildResult(
            'critical_stock',
            requiredResources,
            items,
            variants.length === FETCH_CAP,
        );
    } catch (error) {
        return failedResult('critical_stock', requiredResources, error);
    }
}

export async function detectStuckSalesOrders(
    tenantDb: PrismaClient,
): Promise<DetectionResult> {
    const requiredResources = detectorResources('stuck_so');
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
    creditedAmount: Prisma.Decimal;
    priceAdjustmentAmount: Prisma.Decimal;
    dueDate: Date | null;
    soNumber: string | null;
    customerName: string | null;
};

export async function detectOverdueAr(
    tenantDb: PrismaClient,
    now: Date = new Date(),
): Promise<DetectionResult> {
    const requiredResources = detectorResources('overdue_ar');
    try {
        const rows = await tenantDb.$queryRaw<OverdueArRow[]>(Prisma.sql`
      SELECT i.id AS "invoiceId", i."invoiceNumber", i."totalAmount", i."paidAmount", i."creditedAmount", i."priceAdjustmentAmount", i."dueDate",
             so."orderNumber" AS "soNumber", c.name AS "customerName"
      FROM "Invoice" i
      LEFT JOIN "SalesOrder" so ON i."salesOrderId" = so.id
      LEFT JOIN "Customer" c ON so."customerId" = c.id
      WHERE i."dueDate" < ${now}
        AND i."totalAmount" + i."priceAdjustmentAmount" > i."paidAmount" + i."creditedAmount"
        AND i.status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
      ORDER BY i."dueDate" ASC
      LIMIT ${FETCH_CAP}
    `);

        const items: DetectedItem[] = rows.map((row) => {
            const outstanding =
                Number(row.totalAmount) + Number(row.priceAdjustmentAmount ?? 0) - Number(row.paidAmount) - Number(row.creditedAmount ?? 0);
            const days = daysOverdue(row.dueDate, now);
            return {
                entityKey: `overdue_ar:${row.invoiceId}`,
                entityType: 'Invoice',
                entityId: row.invoiceId,
                severity: overdueSeverity(days),
                headline: `Invoice ${row.invoiceNumber} — ${row.customerName ?? 'Tanpa customer'} (SO: ${row.soNumber || '-'})`,
                detail: `Lewat jatuh tempo ${days} hari, sisa Rp ${outstanding.toLocaleString('id-ID')}`,
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
    supplierName: string | null;
};

/**
 * Same boundary as the legacy OVERDUE_AP producer: due before the start of
 * today's WIB business day, status UNPAID/PARTIAL.
 */
export async function detectOverdueAp(
    tenantDb: PrismaClient,
    now: Date = new Date(),
): Promise<DetectionResult> {
    const requiredResources = detectorResources('overdue_ap');
    try {
        const businessDayStart = getWibDayBounds(toBusinessDateString(now)).startOfDay;
        const rows = await tenantDb.$queryRaw<OverdueApRow[]>(Prisma.sql`
      SELECT pi.id AS "invoiceId", pi."invoiceNumber", pi."totalAmount", pi."paidAmount", pi."dueDate",
             po."orderNumber" AS "poNumber", s.name AS "supplierName"
      FROM "PurchaseInvoice" pi
      LEFT JOIN "PurchaseOrder" po ON pi."purchaseOrderId" = po.id
      LEFT JOIN "Supplier" s ON po."supplierId" = s.id
      WHERE pi."dueDate" < ${businessDayStart}
        AND pi.status IN ('UNPAID', 'PARTIAL')
      ORDER BY pi."dueDate" ASC
      LIMIT ${FETCH_CAP}
    `);

        const items: DetectedItem[] = rows.map((row) => {
            const outstanding =
                Number(row.totalAmount) - Number(row.paidAmount);
            const days = daysOverdue(row.dueDate, now);
            return {
                entityKey: `overdue_ap:${row.invoiceId}`,
                entityType: 'PurchaseInvoice',
                entityId: row.invoiceId,
                severity: overdueSeverity(days),
                headline: `Invoice ${row.invoiceNumber} — ${row.supplierName ?? 'Tanpa supplier'} (PO: ${row.poNumber || '-'})`,
                detail: `Lewat jatuh tempo ${days} hari, sisa Rp ${outstanding.toLocaleString('id-ID')}`,
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
    const requiredResources = detectorResources('production_no_progress');
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
    tenantDb: Prisma.TransactionClient | PrismaClient,
): Promise<DetectionResult> {
    const requiredResources = detectorResources('missing_finance_journal');
    try {
        const issues = await collectFinanceJournalIssues(tenantDb);
        // Continue bounded pages, but never let a large tenant monopolize the digest.
        // Truncation prevents findings outside this scan from being auto-resolved.
        let cursor = issues.barterNextCursor;
        let barterTruncated = issues.barterScanTruncated;
        const barterIssues = [...(issues.barterSettlementsInvalid ?? [])];
        for (let page = 1; cursor && page < 5 && barterIssues.length < FETCH_CAP; page++) {
            const next = await collectBarterHealth(tenantDb, cursor);
            barterIssues.push(...next.issues);
            cursor = next.nextCursor;
            barterTruncated = next.truncated;
        }
        const items: DetectedItem[] = [];
        for (const issue of barterIssues) {
            items.push({
                entityKey: `missing_finance_journal:BARTER:${issue.id}:${issue.reason}`,
                entityType: 'BarterSettlement', entityId: issue.id, severity: 'critical',
                headline: `Barter ${issue.settlementNumber} tidak konsisten`,
                detail: `${issue.reason}. Diagnosis paket; jangan membuat jurnal bank untuk kaki offset.`,
            });
        }

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
        for (const inv of issues.salesInvoicesUnposted) {
            items.push({
                entityKey: `missing_finance_journal:SALES_INVOICE_UNPOSTED:${inv.id}`,
                entityType: 'Invoice', entityId: inv.id, severity: 'critical',
                headline: `Invoice ${inv.invoiceNumber} jurnal belum POSTED`,
                detail: `${rupiah(inv.totalAmount)} — status ${inv.status}. Periksa dan posting jurnal yang ada; jangan membuat duplikat.`,
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
                headline: `Payment pelanggan ${p.paymentNumber ?? p.id.slice(0, 8)} belum ada jurnal POSTED`,
                detail: `${rupiah(p.amount)} — ${p.method ?? 'metode tidak dicatat'}. Periksa jurnal yang ada sebelum membuat jurnal baru.`,
            });
        }
        for (const inv of issues.purchaseInvoicesMissing) {
            items.push({
                entityKey: `missing_finance_journal:PURCHASE_INVOICE:${inv.id}`,
                entityType: 'PurchaseInvoice',
                entityId: inv.id,
                severity: 'critical',
                headline: `Invoice pembelian ${inv.invoiceNumber} belum ada jurnal AP POSTED`,
                detail: `${rupiah(inv.totalAmount)} — status ${inv.status}. Periksa jurnal yang ada sebelum membuat jurnal baru.`,
            });
        }
        for (const p of issues.purchasePaymentsMissing) {
            items.push({
                entityKey: `missing_finance_journal:PURCHASE_PAYMENT:${p.id}`,
                entityType: 'Payment',
                entityId: p.id,
                severity: 'critical',
                headline: `Payment supplier ${p.paymentNumber ?? p.id.slice(0, 8)} belum ada jurnal POSTED`,
                detail: `${rupiah(p.amount)} — ${p.method ?? 'metode tidak dicatat'}. Periksa jurnal yang ada sebelum membuat jurnal baru.`,
            });
        }

        const capped = items.slice(0, FETCH_CAP);
        return buildResult(
            'missing_finance_journal',
            requiredResources,
            capped,
            items.length >= FETCH_CAP || barterTruncated,
        );
    } catch (error) {
        return failedResult('missing_finance_journal', requiredResources, error);
    }
}
