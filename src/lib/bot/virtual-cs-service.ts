import { prisma } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';
import { enforceGuardrails } from './guardrails';

export type VirtualCsRequest = {
  question: string;
  channel: 'telegram' | 'web';
  requesterName?: string;
};

export type VirtualCsResponse = {
  answer: string;
  citations: string[];
  safety: {
    allowed: boolean;
    blockedReason?: string;
  };
};

type Intent =
  | 'stock_overview'
  | 'critical_stock'
  | 'active_production'
  | 'pending_sales'
  | 'finance_summary'
  | 'stock_mutation_today'
  | 'sop_help'
  | 'unknown';

type StockRow = {
  product: string;
  location: string;
  quantity: Prisma.Decimal;
};

type CriticalStockRow = {
  product: string;
  qty: Prisma.Decimal;
  threshold: Prisma.Decimal;
};

type ActiveProductionRow = {
  orderNumber: string;
  product: string;
  target: Prisma.Decimal;
  machine: string | null;
};

type PendingSalesRow = {
  orderNumber: string;
  customer: string | null;
  total: Prisma.Decimal;
};

type MutationRow = {
  type: string;
  qty: Prisma.Decimal;
  txCount: bigint;
};

function detectIntent(question: string): Intent {
  const q = question.toLowerCase();

  if (q.includes('stok kritis') || q.includes('stok menipis')) return 'critical_stock';
  if (q.includes('stok') || q.includes('inventory') || q.includes('persediaan')) return 'stock_overview';
  if (q.includes('produksi') || q.includes('spk') || q.includes('order produksi')) return 'active_production';
  if (q.includes('pending sales') || q.includes('belum terkirim') || q.includes('sales order')) return 'pending_sales';
  if (q.includes('finance') || q.includes('piutang') || q.includes('hutang')) return 'finance_summary';
  if (q.includes('mutasi')) return 'stock_mutation_today';
  if (q.includes('sop') || q.includes('cara') || q.includes('bagaimana')) return 'sop_help';

  return 'unknown';
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

async function getStockOverview(): Promise<string> {
  const rows = await prisma.$queryRaw<StockRow[]>(Prisma.sql`
    SELECT p.name AS product, l.name AS location, SUM(i.quantity) AS quantity
    FROM "Inventory" i
    JOIN "ProductVariant" pv ON i."productVariantId" = pv.id
    JOIN "Product" p ON pv."productId" = p.id
    JOIN "Location" l ON i."locationId" = l.id
    WHERE i.quantity > 0
    GROUP BY p.name, l.name
    ORDER BY l.name, SUM(i.quantity) DESC
    LIMIT 12
  `);

  if (!rows.length) {
    return 'Saat ini belum ada stok positif yang bisa ditampilkan.';
  }

  const lines = rows.map(
    (row) => `- ${row.product} di ${row.location}: ${Number(row.quantity).toFixed(2)}`
  );
  return `Ringkasan stok teratas saat ini:\n${lines.join('\n')}`;
}

async function getCriticalStock(): Promise<string> {
  const rows = await prisma.$queryRaw<CriticalStockRow[]>(Prisma.sql`
    SELECT p.name AS product, SUM(i.quantity) AS qty, SUM(pv."minStockAlert") AS threshold
    FROM "Inventory" i
    JOIN "ProductVariant" pv ON i."productVariantId" = pv.id
    JOIN "Product" p ON pv."productId" = p.id
    GROUP BY p.name
    HAVING SUM(i.quantity) < SUM(pv."minStockAlert") AND SUM(pv."minStockAlert") > 0
    ORDER BY qty ASC
    LIMIT 10
  `);

  if (!rows.length) {
    return 'Kabar baik, stok kritis tidak terdeteksi saat ini.';
  }

  const lines = rows.map(
    (row) => `- ${row.product}: ${Number(row.qty).toFixed(2)} (ambang ${Number(row.threshold).toFixed(2)})`
  );
  return `Produk dengan stok kritis:\n${lines.join('\n')}`;
}

async function getActiveProduction(): Promise<string> {
  const rows = await prisma.$queryRaw<ActiveProductionRow[]>(Prisma.sql`
    SELECT po."orderNumber", p.name AS product, po."plannedQuantity" AS target, m.name AS machine
    FROM "ProductionOrder" po
    JOIN "Bom" b ON po."bomId" = b.id
    JOIN "ProductVariant" pv ON b."productVariantId" = pv.id
    JOIN "Product" p ON pv."productId" = p.id
    LEFT JOIN "Machine" m ON po."machineId" = m.id
    WHERE po.status = 'IN_PROGRESS'
    ORDER BY po."actualStartDate" DESC NULLS LAST
    LIMIT 8
  `);

  if (!rows.length) {
    return 'Saat ini tidak ada SPK produksi yang berjalan.';
  }

  const lines = rows.map(
    (row) => `- ${row.orderNumber}: ${row.product}, target ${Number(row.target).toFixed(2)}, mesin ${row.machine || 'N/A'}`
  );
  return `SPK aktif saat ini:\n${lines.join('\n')}`;
}

async function getPendingSales(): Promise<string> {
  const rows = await prisma.$queryRaw<PendingSalesRow[]>(Prisma.sql`
    SELECT so."orderNumber", c.name AS customer, so."totalAmount" AS total
    FROM "SalesOrder" so
    LEFT JOIN "Customer" c ON so."customerId" = c.id
    WHERE so.status IN ('CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP')
    ORDER BY so."orderDate" ASC
    LIMIT 10
  `);

  if (!rows.length) {
    return 'Tidak ada sales order pending. Semua pesanan terpantau aman.';
  }

  const lines = rows.map(
    (row) => `- ${row.orderNumber} (${row.customer || 'Guest'}) total ${formatCurrency(Number(row.total))}`
  );
  return `Daftar sales order pending:\n${lines.join('\n')}`;
}

async function getFinanceSummary(): Promise<string> {
  const arRows = await prisma.$queryRaw<{ total: Prisma.Decimal }[]>(Prisma.sql`
    SELECT COALESCE(SUM("totalAmount" - "paidAmount"), 0) AS total
    FROM "Invoice"
    WHERE status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
  `);

  const apRows = await prisma.$queryRaw<{ total: Prisma.Decimal }[]>(Prisma.sql`
    SELECT COALESCE(SUM("totalAmount" - "paidAmount"), 0) AS total
    FROM "PurchaseInvoice"
    WHERE status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
  `);

  const ar = Number(arRows[0]?.total || 0);
  const ap = Number(apRows[0]?.total || 0);

  return [
    'Ringkasan finance outstanding saat ini:',
    `- Piutang customer: ${formatCurrency(ar)}`,
    `- Hutang supplier: ${formatCurrency(ap)}`,
  ].join('\n');
}

async function getStockMutationToday(): Promise<string> {
  const rows = await prisma.$queryRaw<MutationRow[]>(Prisma.sql`
    SELECT type, SUM(quantity) AS qty, COUNT(*)::bigint AS "txCount"
    FROM "StockMovement"
    WHERE DATE("createdAt") = CURRENT_DATE
    GROUP BY type
    ORDER BY type ASC
  `);

  if (!rows.length) {
    return 'Belum ada mutasi stok hari ini.';
  }

  const lines = rows.map(
    (row) => `- ${row.type}: ${row.txCount.toString()} transaksi, qty ${Number(row.qty).toFixed(2)}`
  );
  return `Mutasi stok hari ini:\n${lines.join('\n')}`;
}

function getSopHelp(): string {
  return [
    'Saya bisa bantu panduan SOP penggunaan Polyflow secara umum.',
    'Contoh pertanyaan:',
    '- Cara input stok awal di modul gudang?',
    '- Cara cek SPK yang sedang berjalan?',
    '- Cara melihat invoice yang belum lunas?',
    'Kalau mau revisi data, tetap dilakukan manual lewat UI Polyflow ya.',
  ].join('\n');
}

export async function generateVirtualCsReply(input: VirtualCsRequest): Promise<VirtualCsResponse> {
  const guard = enforceGuardrails(input.question);
  if (!guard.allowed) {
    return {
      answer: guard.reason || 'Maaf, permintaan tidak bisa diproses.',
      citations: ['policy:read-only', 'policy:topic-lock'],
      safety: {
        allowed: false,
        blockedReason: guard.reason,
      },
    };
  }

  const intent = detectIntent(input.question);
  let body: string;

  switch (intent) {
    case 'stock_overview':
      body = await getStockOverview();
      break;
    case 'critical_stock':
      body = await getCriticalStock();
      break;
    case 'active_production':
      body = await getActiveProduction();
      break;
    case 'pending_sales':
      body = await getPendingSales();
      break;
    case 'finance_summary':
      body = await getFinanceSummary();
      break;
    case 'stock_mutation_today':
      body = await getStockMutationToday();
      break;
    case 'sop_help':
      body = getSopHelp();
      break;
    default:
      body = 'Bisa dibantu dengan kata kunci yang lebih spesifik ya. Contoh: stok, stok kritis, produksi aktif, pending sales, finance, atau mutasi hari ini.';
      break;
  }

  const greeting = input.requesterName ? `Halo ${input.requesterName},` : 'Halo,';

  return {
    answer: `${greeting}\n${body}\n\nSaya hanya bisa bantu baca data dan panduan penggunaan. Kalau mau ubah data, silakan lewat UI Polyflow ya.`,
    citations: ['db:polyflow-readonly', 'policy:read-only', 'policy:topic-lock'],
    safety: {
      allowed: true,
    },
  };
}
