import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

export type DigestFinding = {
  detector: string;
  severity: 'warning' | 'critical';
  requiredResources: string[];
  headline: string;
  detail?: string;
};

const MAX_ITEMS = 5;

type CriticalStockRow = {
  product: string;
  qty: Prisma.Decimal;
  threshold: Prisma.Decimal;
};

export async function detectCriticalStock(
  tenantDb: PrismaClient,
): Promise<DigestFinding[]> {
  try {
    const rows = await tenantDb.$queryRaw<CriticalStockRow[]>(Prisma.sql`
      SELECT p.name AS product, SUM(i.quantity) AS qty, SUM(pv."minStockAlert") AS threshold
      FROM "Inventory" i
      JOIN "ProductVariant" pv ON i."productVariantId" = pv.id
      JOIN "Product" p ON pv."productId" = p.id
      GROUP BY p.name
      HAVING SUM(i.quantity) < SUM(pv."minStockAlert") AND SUM(pv."minStockAlert") > 0
      ORDER BY qty ASC
      LIMIT ${MAX_ITEMS + 1}
    `);

    const capped = rows.slice(0, MAX_ITEMS);
    const remainder = rows.length - MAX_ITEMS;

    return capped.map((row, i) => ({
      detector: 'critical_stock',
      severity: 'critical' as const,
      requiredResources: ['/warehouse/inventory'],
      headline:
        i === 0 && rows.length > MAX_ITEMS
          ? `${rows.length} produk stok kritis`
          : `${row.product}: ${Number(row.qty).toFixed(0)} < ${Number(row.threshold).toFixed(0)}`,
      detail:
        i === 0 && remainder > 0 ? `...dan ${remainder} lainnya` : undefined,
    }));
  } catch {
    return [];
  }
}

export async function detectStuckSalesOrders(
  tenantDb: PrismaClient,
): Promise<DigestFinding[]> {
  try {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 3);

    const rows = await tenantDb.salesOrder.findMany({
      where: {
        status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP'] },
        orderDate: { lt: threshold },
      },
      select: {
        orderNumber: true,
        customer: { select: { name: true } },
        orderDate: true,
      },
      orderBy: { orderDate: 'asc' },
      take: MAX_ITEMS + 1,
    });

    const findings: DigestFinding[] = [];
    const show = rows.slice(0, MAX_ITEMS);

    for (const row of show) {
      const daysSince = Math.floor(
        (Date.now() - row.orderDate.getTime()) / 86_400_000,
      );
      findings.push({
        detector: 'stuck_so',
        severity: 'warning',
        requiredResources: ['/sales/orders'],
        headline: `${row.orderNumber} — ${row.customer?.name || 'Guest'}`,
        detail: `${daysSince} hari sejak order, belum selesai`,
      });
    }

    if (rows.length > MAX_ITEMS) {
      findings.push({
        detector: 'stuck_so',
        severity: 'warning',
        requiredResources: ['/sales/orders'],
        headline: `...dan ${rows.length - MAX_ITEMS} SO lain belum selesai`,
      });
    }

    return findings;
  } catch {
    return [];
  }
}

type OverdueArRow = {
  invoiceNumber: string;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  dueDate: Date | null;
  soNumber: string | null;
};

export async function detectOverdueAr(
  tenantDb: PrismaClient,
): Promise<DigestFinding[]> {
  try {
    const rows = await tenantDb.$queryRaw<OverdueArRow[]>(Prisma.sql`
      SELECT i."invoiceNumber", i."totalAmount", i."paidAmount", i."dueDate",
             so."orderNumber" AS "soNumber"
      FROM "Invoice" i
      LEFT JOIN "SalesOrder" so ON i."salesOrderId" = so.id
      WHERE i."dueDate" < NOW()
        AND i.status IN ('UNPAID', 'PARTIAL')
      ORDER BY i."dueDate" ASC
      LIMIT ${MAX_ITEMS + 1}
    `);

    const capped = rows.slice(0, MAX_ITEMS);
    const remainder = rows.length - MAX_ITEMS;

    const findings: DigestFinding[] = [];
    for (const row of capped) {
      const outstanding =
        Number(row.totalAmount) - Number(row.paidAmount);
      findings.push({
        detector: 'overdue_ar',
        severity: 'critical',
        requiredResources: ['/finance/invoices'],
        headline: `Invoice ${row.invoiceNumber} (SO: ${row.soNumber || '-'})`,
        detail: `Jatuh tempo, sisa Rp ${outstanding.toLocaleString('id-ID')}`,
      });
    }

    if (remainder > 0) {
      findings.push({
        detector: 'overdue_ar',
        severity: 'critical',
        requiredResources: ['/finance/invoices'],
        headline: `...dan ${remainder} invoice overdue lainnya`,
      });
    }

    return findings;
  } catch {
    return [];
  }
}

type OverdueApRow = {
  invoiceNumber: string;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  dueDate: Date | null;
  poNumber: string | null;
};

export async function detectOverdueAp(
  tenantDb: PrismaClient,
): Promise<DigestFinding[]> {
  try {
    const rows = await tenantDb.$queryRaw<OverdueApRow[]>(Prisma.sql`
      SELECT pi."invoiceNumber", pi."totalAmount", pi."paidAmount", pi."dueDate",
             po."orderNumber" AS "poNumber"
      FROM "PurchaseInvoice" pi
      LEFT JOIN "PurchaseOrder" po ON pi."purchaseOrderId" = po.id
      WHERE pi."dueDate" < NOW()
        AND pi.status IN ('UNPAID', 'PARTIAL')
      ORDER BY pi."dueDate" ASC
      LIMIT ${MAX_ITEMS + 1}
    `);

    const capped = rows.slice(0, MAX_ITEMS);
    const remainder = rows.length - MAX_ITEMS;

    const findings: DigestFinding[] = [];
    for (const row of capped) {
      const outstanding =
        Number(row.totalAmount) - Number(row.paidAmount);
      findings.push({
        detector: 'overdue_ap',
        severity: 'critical',
        requiredResources: ['/purchasing/invoices'],
        headline: `Invoice ${row.invoiceNumber} (PO: ${row.poNumber || '-'})`,
        detail: `Jatuh tempo, sisa Rp ${outstanding.toLocaleString('id-ID')}`,
      });
    }

    if (remainder > 0) {
      findings.push({
        detector: 'overdue_ap',
        severity: 'critical',
        requiredResources: ['/purchasing/invoices'],
        headline: `...dan ${remainder} invoice overdue lainnya`,
      });
    }

    return findings;
  } catch {
    return [];
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
): Promise<DigestFinding[]> {
  try {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);

    const rows = await tenantDb.$queryRaw<ProductionNoProgressRow[]>(Prisma.sql`
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
      LIMIT ${MAX_ITEMS + 1}
    `);

    const capped = rows.slice(0, MAX_ITEMS);
    const remainder = rows.length - MAX_ITEMS;

    const findings: DigestFinding[] = capped.map((row, i) => ({
      detector: 'production_no_progress',
      severity: 'warning' as const,
      requiredResources: ['/production/orders'],
      headline:
        i === 0 && remainder > 0
          ? `${rows.length} SPK tanpa progres`
          : `SPK ${row.orderNumber || row.id.slice(0, 8)}`,
      detail:
        i === 0 && remainder > 0
          ? `...dan ${remainder} lainnya`
          : `${Math.floor(row.hoursSince)} jam tanpa progres`,
    }));

    return findings;
  } catch {
    return [];
  }
}
