import { z } from 'zod';
import { prisma } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';
import { searchHelpArticles } from './help-articles';
import type {
    AssistantToolDefinition,
    AssistantUserContext,
    ToolEvidence,
} from './assistant-types';
import { createEvidence } from './evidence';
import { checkToolAuthorization } from './tool-authorization';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(value);
}

// ---------------------------------------------------------------------------
// Tool implementations (refactored from virtual-cs-service.ts)
// ---------------------------------------------------------------------------

// --- get_product_stock ---
type StockRow = { product: string; location: string; quantity: Prisma.Decimal };

async function executeGetProductStock(
    args: { productName: string },
    _ctx: AssistantUserContext,
): Promise<ToolEvidence> {
    const rows = await prisma.$queryRaw<StockRow[]>(Prisma.sql`
    SELECT p.name AS product, l.name AS location, COALESCE(SUM(i.quantity), 0) AS quantity
    FROM "Inventory" i
    JOIN "ProductVariant" pv ON i."productVariantId" = pv.id
    JOIN "Product" p ON pv."productId" = p.id
    JOIN "Location" l ON i."locationId" = l.id
    WHERE pv.name ILIKE ${'%' + args.productName + '%'} OR p.name ILIKE ${'%' + args.productName + '%'}
    GROUP BY p.name, l.name
    ORDER BY SUM(i.quantity) DESC
  `);

    if (!rows.length) {
        return createEvidence({
            summary: `Stok untuk produk '${args.productName}' tidak ditemukan atau kosong.`,
            facts: [{ label: 'Produk', value: args.productName }],
            source: 'tenant-data',
            completeness: 'partial',
        });
    }

    const facts = rows.map((row) => ({
        label: `${row.location}`,
        value: `${Number(row.quantity).toFixed(2)} KG`,
    }));

    return createEvidence({
        summary: `Informasi stok fisik untuk produk '${args.productName}':`,
        facts,
        source: 'tenant-data',
    });
}

// --- get_sales_order_lines ---
type SoRow = {
    id: string;
    orderNumber: string;
    customer: string | null;
    status: string;
};

async function executeGetSalesOrderLines(
    args: { searchTerm: string },
    _ctx: AssistantUserContext,
): Promise<ToolEvidence> {
    const orders = await prisma.$queryRaw<SoRow[]>(Prisma.sql`
    SELECT so.id, so."orderNumber", c.name as customer, so.status
    FROM "SalesOrder" so
    LEFT JOIN "Customer" c ON so."customerId" = c.id
    WHERE so."orderNumber" ILIKE ${'%' + args.searchTerm + '%'} OR c.name ILIKE ${'%' + args.searchTerm + '%'} OR so."id" = ${args.searchTerm}
    ORDER BY so."createdAt" DESC
    LIMIT 3
  `);

    if (!orders.length) {
        return createEvidence({
            summary: `Sales Order dengan kata kunci '${args.searchTerm}' tidak ditemukan.`,
            facts: [{ label: 'Pencarian', value: args.searchTerm }],
            source: 'tenant-data',
            completeness: 'partial',
        });
    }

    const entities: {
        type: string;
        id: string;
        label: string;
        href: string;
    }[] = [];
    const facts: { label: string; value: string }[] = [];

    for (const order of orders) {
        const items = await prisma.$queryRaw<
            { variant: string; quantity: Prisma.Decimal }[]
        >(Prisma.sql`
      SELECT pv.name as variant, soi.quantity
      FROM "SalesOrderItem" soi
      JOIN "ProductVariant" pv ON soi."productVariantId" = pv.id
      WHERE soi."salesOrderId" = ${order.id}
    `);

        entities.push({
            type: 'SalesOrder',
            id: order.orderNumber,
            label: `${order.orderNumber} — ${order.customer || 'Guest'} [${order.status}]`,
            href: `/sales/orders`,
        });

        for (const item of items) {
            facts.push({
                label: `${order.orderNumber} — ${item.variant}`,
                value: `${Number(item.quantity).toFixed(2)} KG`,
            });
        }
    }

    return createEvidence({
        summary: `Ditemukan ${orders.length} Sales Order untuk pencarian '${args.searchTerm}':`,
        facts,
        entities,
        source: 'tenant-data',
    });
}

// --- get_finance_summary ---
type FinanceRow = { total: Prisma.Decimal };

async function executeGetFinanceSummary(
    _args: Record<string, never>,
    _ctx: AssistantUserContext,
): Promise<ToolEvidence> {
    const arRows = await prisma.$queryRaw<FinanceRow[]>(Prisma.sql`
    SELECT COALESCE(SUM("totalAmount" - "paidAmount"), 0) AS total
    FROM "Invoice"
    WHERE status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
  `);

    const apRows = await prisma.$queryRaw<FinanceRow[]>(Prisma.sql`
    SELECT COALESCE(SUM("totalAmount" - "paidAmount"), 0) AS total
    FROM "PurchaseInvoice"
    WHERE status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
  `);

    const ar = Number(arRows[0]?.total || 0);
    const ap = Number(apRows[0]?.total || 0);

    return createEvidence({
        summary: 'Ringkasan finance outstanding saat ini:',
        facts: [
            { label: 'Piutang customer', value: formatCurrency(ar) },
            { label: 'Hutang supplier', value: formatCurrency(ap) },
        ],
        source: 'tenant-data',
    });
}

// --- get_active_production ---
type ActiveProductionRow = {
    orderNumber: string;
    product: string;
    target: Prisma.Decimal;
    machine: string | null;
};

async function executeGetActiveProduction(
    _args: Record<string, never>,
    _ctx: AssistantUserContext,
): Promise<ToolEvidence> {
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
        return createEvidence({
            summary: 'Saat ini tidak ada SPK produksi yang berjalan.',
            facts: [],
            source: 'tenant-data',
            completeness: 'partial',
        });
    }

    const facts = rows.map((row) => ({
        label: row.orderNumber,
        value: `${row.product}, target ${Number(row.target).toFixed(2)}, mesin ${row.machine || 'N/A'}`,
    }));

    const entities = rows.map((row) => ({
        type: 'ProductionOrder',
        id: row.orderNumber,
        label: `${row.orderNumber} — ${row.product}`,
        href: '/production/orders',
    }));

    return createEvidence({
        summary: `SPK aktif saat ini (${rows.length} ditemukan):`,
        facts,
        entities,
        source: 'tenant-data',
    });
}

// --- get_general_stock_overview ---
type OverviewStockRow = {
    product: string;
    location: string;
    quantity: Prisma.Decimal;
};

async function executeGetGeneralStockOverview(
    _args: Record<string, never>,
    _ctx: AssistantUserContext,
): Promise<ToolEvidence> {
    const rows = await prisma.$queryRaw<OverviewStockRow[]>(Prisma.sql`
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
        return createEvidence({
            summary: 'Saat ini belum ada stok positif yang bisa ditampilkan.',
            facts: [],
            source: 'tenant-data',
            completeness: 'partial',
        });
    }

    const facts = rows.map((row) => ({
        label: `${row.product} — ${row.location}`,
        value: `${Number(row.quantity).toFixed(2)}`,
    }));

    return createEvidence({
        summary: 'Ringkasan stok teratas saat ini:',
        facts,
        source: 'tenant-data',
    });
}

// --- get_critical_stock_overview ---
type CriticalStockRow = {
    product: string;
    qty: Prisma.Decimal;
    threshold: Prisma.Decimal;
};

async function executeGetCriticalStockOverview(
    _args: Record<string, never>,
    _ctx: AssistantUserContext,
): Promise<ToolEvidence> {
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
        return createEvidence({
            summary: 'Kabar baik, stok kritis tidak terdeteksi saat ini.',
            facts: [],
            source: 'tenant-data',
            completeness: 'partial',
        });
    }

    const facts = rows.map((row) => ({
        label: row.product,
        value: `${Number(row.qty).toFixed(2)} (ambang ${Number(row.threshold).toFixed(2)})`,
    }));

    return createEvidence({
        summary: `Produk dengan stok kritis (${rows.length} ditemukan):`,
        facts,
        source: 'tenant-data',
    });
}

// --- get_pending_sales_overview ---
type PendingSalesRow = {
    orderNumber: string;
    customer: string | null;
    total: Prisma.Decimal;
};

async function executeGetPendingSalesOverview(
    _args: Record<string, never>,
    _ctx: AssistantUserContext,
): Promise<ToolEvidence> {
    const rows = await prisma.$queryRaw<PendingSalesRow[]>(Prisma.sql`
    SELECT so."orderNumber", c.name AS customer, so."totalAmount" AS total
    FROM "SalesOrder" so
    LEFT JOIN "Customer" c ON so."customerId" = c.id
    WHERE so.status IN ('CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP')
    ORDER BY so."orderDate" ASC
    LIMIT 10
  `);

    if (!rows.length) {
        return createEvidence({
            summary:
                'Tidak ada sales order pending. Semua pesanan terpantau aman.',
            facts: [],
            source: 'tenant-data',
            completeness: 'partial',
        });
    }

    const facts = rows.map((row) => ({
        label: row.orderNumber,
        value: `${row.customer || 'Guest'} — ${formatCurrency(Number(row.total))}`,
    }));

    const entities = rows.map((row) => ({
        type: 'SalesOrder',
        id: row.orderNumber,
        label: `${row.orderNumber} — ${row.customer || 'Guest'}`,
        href: '/sales/orders',
    }));

    return createEvidence({
        summary: `Daftar sales order pending (${rows.length} ditemukan):`,
        facts,
        entities,
        source: 'tenant-data',
    });
}

// --- search_help_articles ---
async function executeSearchHelpArticles(
    args: { query: string; module?: string },
    _ctx: AssistantUserContext,
): Promise<ToolEvidence> {
    const results = await searchHelpArticles(args.query, args.module, 5);

    if (!results.length) {
        return createEvidence({
            summary: 'Tidak ditemukan artikel yang relevan di Knowledge Base.',
            facts: [{ label: 'Pencarian', value: args.query }],
            source: 'global-kb',
            completeness: 'partial',
        });
    }

    const facts = results.map((r) => ({
        label: r.title,
        value: r.summary?.slice(0, 150) || '',
    }));

    const entities = results.map((r) => ({
        type: 'HelpArticle',
        id: r.slug,
        label: r.title,
        href: `/support/${r.slug}`,
    }));

    return createEvidence({
        summary: `Artikel ditemukan di Knowledge Base (${results.length} hasil):`,
        facts,
        entities,
        source: 'global-kb',
    });
}

// ---------------------------------------------------------------------------
// Tool Registry — permission-aware definitions
// ---------------------------------------------------------------------------

export const toolRegistry: AssistantToolDefinition[] = [
    {
        name: 'get_product_stock',
        description:
            'Ambil informasi stok fisik yang tersedia untuk sebuah produk secara spesifik. Berguna ketika memeriksa stok.',
        requiredResources: ['/warehouse/inventory'],
        sensitivity: 'normal',
        inputSchema: z.object({
            productName: z.string().min(1, 'Nama produk harus diisi'),
        }),
        execute: (args, ctx) =>
            executeGetProductStock(args as { productName: string }, ctx),
    },
    {
        name: 'get_sales_order_lines',
        description:
            'Ambil detail barang (line item) dan kuantitas yang diminta dalam sebuah Sales Order. Berguna ketika menganalisis mengapa pesanan gagal atau inventory insufficient.',
        requiredResources: ['/sales/orders'],
        sensitivity: 'normal',
        inputSchema: z.object({
            searchTerm: z
                .string()
                .min(1, 'Nomor order atau nama customer harus diisi'),
        }),
        execute: (args, ctx) =>
            executeGetSalesOrderLines(args as { searchTerm: string }, ctx),
    },
    {
        name: 'get_finance_summary',
        description: 'Ringkasan utang/piutang (finance outstanding).',
        requiredResources: ['/finance/aging'],
        sensitivity: 'financial',
        inputSchema: z.object({}),
        execute: (args, ctx) =>
            executeGetFinanceSummary(args as Record<string, never>, ctx),
    },
    {
        name: 'get_active_production',
        description: 'Daftar SPK/produksi aktif.',
        requiredResources: ['/production/orders'],
        sensitivity: 'normal',
        inputSchema: z.object({}),
        execute: (args, ctx) =>
            executeGetActiveProduction(args as Record<string, never>, ctx),
    },
    {
        name: 'get_general_stock_overview',
        description:
            'Ranking 12 stok terbanyak saat ini di gudang secara umum.',
        requiredResources: ['/warehouse/inventory'],
        sensitivity: 'normal',
        inputSchema: z.object({}),
        execute: (args, ctx) =>
            executeGetGeneralStockOverview(args as Record<string, never>, ctx),
    },
    {
        name: 'get_critical_stock_overview',
        description:
            'Daftar produk yang stoknya kurang dari nilai ambang batas minimum.',
        requiredResources: ['/warehouse/inventory'],
        sensitivity: 'normal',
        inputSchema: z.object({}),
        execute: (args, ctx) =>
            executeGetCriticalStockOverview(args as Record<string, never>, ctx),
    },
    {
        name: 'get_pending_sales_overview',
        description:
            'Daftar ringkas sales orders yang statusnya belum selesai.',
        requiredResources: ['/sales/orders'],
        sensitivity: 'normal',
        inputSchema: z.object({}),
        execute: (args, ctx) =>
            executeGetPendingSalesOverview(args as Record<string, never>, ctx),
    },
    {
        name: 'search_help_articles',
        description:
            'Cari artikel panduan / FAQ / troubleshooting dari Knowledge Base. WAJIB gunakan tool ini untuk pertanyaan cara pakai, bagaimana cara, tutorial, atau troubleshooting sebelum menjawab sendiri.',
        requiredResources: [],
        sensitivity: 'normal',
        inputSchema: z.object({
            query: z.string().min(1, 'Query harus diisi'),
            module: z.string().optional(),
        }),
        execute: (args, ctx) =>
            executeSearchHelpArticles(
                args as { query: string; module?: string },
                ctx,
            ),
    },

    // --- Wave 2: Additional operational tools ---

    // get_delivery_status
    {
        name: 'get_delivery_status',
        description:
            'Cek status pengiriman, jadwal DO/SJ, atau apakah pesanan sudah dikirim.',
        requiredResources: ['/sales/deliveries'],
        sensitivity: 'normal',
        inputSchema: z.object({
            searchTerm: z
                .string()
                .min(1, 'Nomor order atau nama customer harus diisi'),
        }),
        execute: async (args, _ctx): Promise<ToolEvidence> => {
            const { searchTerm } = args as { searchTerm: string };
            const rows = await prisma.$queryRaw<
                {
                    id: string;
                    orderNumber: string;
                    status: string;
                    customer: string | null;
                    deliveryDate: Date | null;
                }[]
            >(Prisma.sql`
        SELECT d.id, d."orderNumber", d.status, d."deliveryDate", d."estimatedArrival",
               c.name AS customer, so."orderNumber" AS soNumber
        FROM "DeliveryOrder" d
        LEFT JOIN "SalesOrder" so ON d."salesOrderId" = so.id
        LEFT JOIN "Customer" c ON so."customerId" = c.id
        WHERE d."orderNumber" ILIKE ${'%' + searchTerm + '%'}
           OR so."orderNumber" ILIKE ${'%' + searchTerm + '%'}
           OR c.name ILIKE ${'%' + searchTerm + '%'}
        ORDER BY d."createdAt" DESC
        LIMIT 5
      `);

            if (!rows.length) {
                return createEvidence({
                    summary: `Pengiriman dengan kata kunci '${searchTerm}' tidak ditemukan.`,
                    facts: [{ label: 'Pencarian', value: searchTerm }],
                    source: 'tenant-data',
                    completeness: 'partial',
                });
            }

            const facts = rows.map(
                (r: {
                    orderNumber: string;
                    status: string;
                    customer: string | null;
                    deliveryDate: Date | null;
                }) => ({
                    label: r.orderNumber,
                    value: `${r.status} — ${r.customer || '-'} — ${r.deliveryDate ? new Date(r.deliveryDate).toLocaleDateString('id-ID') : 'Belum dijadwalkan'}`,
                }),
            );

            const entities = rows.map(
                (r: { id: string; orderNumber: string }) => ({
                    type: 'DeliveryOrder',
                    id: r.id,
                    label: r.orderNumber,
                    href: '/sales/deliveries',
                }),
            );

            return createEvidence({
                summary: `Status pengiriman untuk '${searchTerm}':`,
                facts,
                entities,
                source: 'tenant-data',
            });
        },
    },

    // get_invoice_status
    {
        name: 'get_invoice_status',
        description:
            'Cek status invoice penjualan, apakah sudah lunas, partial, atau overdue.',
        requiredResources: ['/finance/invoices/sales'],
        sensitivity: 'financial',
        inputSchema: z.object({
            searchTerm: z
                .string()
                .min(1, 'Nomor invoice atau nama customer harus diisi'),
        }),
        execute: async (args, _ctx): Promise<ToolEvidence> => {
            const { searchTerm } = args as { searchTerm: string };
            const rows = await prisma.$queryRaw<
                {
                    id: string;
                    invoiceNumber: string;
                    status: string;
                    totalAmount: Prisma.Decimal;
                    paidAmount: Prisma.Decimal;
                    dueDate: Date | null;
                    customer: string | null;
                }[]
            >(Prisma.sql`
        SELECT i.id, i."invoiceNumber", i.status, i."totalAmount", i."paidAmount",
               i."dueDate", c.name AS customer
        FROM "Invoice" i
        LEFT JOIN "Customer" c ON i."customerId" = c.id
        WHERE i."invoiceNumber" ILIKE ${'%' + searchTerm + '%'}
           OR c.name ILIKE ${'%' + searchTerm + '%'}
        ORDER BY i."createdAt" DESC
        LIMIT 5
      `);

            if (!rows.length) {
                return createEvidence({
                    summary: `Invoice dengan kata kunci '${searchTerm}' tidak ditemukan.`,
                    facts: [{ label: 'Pencarian', value: searchTerm }],
                    source: 'tenant-data',
                    completeness: 'partial',
                });
            }

            const facts = rows.map(
                (r: {
                    invoiceNumber: string;
                    status: string;
                    totalAmount: Prisma.Decimal;
                    paidAmount: Prisma.Decimal;
                    customer: string | null;
                    dueDate: Date | null;
                }) => {
                    const total = Number(r.totalAmount);
                    const paid = Number(r.paidAmount);
                    const remaining = total - paid;
                    return {
                        label: r.invoiceNumber,
                        value: `${r.status} — ${r.customer || '-'} — Total: ${formatCurrency(total)} — Sisa: ${formatCurrency(remaining)} — Jatuh tempo: ${r.dueDate ? new Date(r.dueDate).toLocaleDateString('id-ID') : '-'}`,
                    };
                },
            );

            const entities = rows.map(
                (r: { id: string; invoiceNumber: string }) => ({
                    type: 'Invoice',
                    id: r.id,
                    label: r.invoiceNumber,
                    href: '/finance/invoices/sales',
                }),
            );

            return createEvidence({
                summary: `Status invoice untuk '${searchTerm}':`,
                facts,
                entities,
                source: 'tenant-data',
            });
        },
    },

    // get_purchase_order
    {
        name: 'get_purchase_order',
        description:
            'Cek status PO, apakah sudah diterima, partial, atau outstanding.',
        requiredResources: ['/purchasing/orders'],
        sensitivity: 'normal',
        inputSchema: z.object({
            searchTerm: z
                .string()
                .min(1, 'Nomor PO atau nama supplier harus diisi'),
        }),
        execute: async (args, _ctx): Promise<ToolEvidence> => {
            const { searchTerm } = args as { searchTerm: string };
            const rows = await prisma.$queryRaw<
                {
                    id: string;
                    orderNumber: string;
                    status: string;
                    totalAmount: Prisma.Decimal;
                    supplier: string | null;
                    orderDate: Date | null;
                }[]
            >(Prisma.sql`
        SELECT po.id, po."orderNumber", po.status, po."totalAmount",
               s.name AS supplier, po."orderDate"
        FROM "PurchaseOrder" po
        LEFT JOIN "Supplier" s ON po."supplierId" = s.id
        WHERE po."orderNumber" ILIKE ${'%' + searchTerm + '%'}
           OR s.name ILIKE ${'%' + searchTerm + '%'}
        ORDER BY po."createdAt" DESC
        LIMIT 5
      `);

            if (!rows.length) {
                return createEvidence({
                    summary: `Purchase Order dengan kata kunci '${searchTerm}' tidak ditemukan.`,
                    facts: [{ label: 'Pencarian', value: searchTerm }],
                    source: 'tenant-data',
                    completeness: 'partial',
                });
            }

            const facts = rows.map(
                (r: {
                    orderNumber: string;
                    status: string;
                    totalAmount: Prisma.Decimal;
                    supplier: string | null;
                    orderDate: Date | null;
                }) => ({
                    label: r.orderNumber,
                    value: `${r.status} — ${r.supplier || '-'} — ${formatCurrency(Number(r.totalAmount))} — ${r.orderDate ? new Date(r.orderDate).toLocaleDateString('id-ID') : '-'}`,
                }),
            );

            const entities = rows.map(
                (r: { id: string; orderNumber: string }) => ({
                    type: 'PurchaseOrder',
                    id: r.id,
                    label: r.orderNumber,
                    href: '/purchasing/orders',
                }),
            );

            return createEvidence({
                summary: `Status PO untuk '${searchTerm}':`,
                facts,
                entities,
                source: 'tenant-data',
            });
        },
    },

    // get_stock_movements
    {
        name: 'get_stock_movements',
        description:
            'Cek riwayat pergerakan stok (masuk/keluar) untuk produk tertentu.',
        requiredResources: ['/warehouse/inventory/history'],
        sensitivity: 'normal',
        inputSchema: z.object({
            productName: z.string().min(1, 'Nama produk harus diisi'),
            limit: z.number().min(1).max(20).optional(),
        }),
        execute: async (args, _ctx): Promise<ToolEvidence> => {
            const { productName, limit: rowLimit } = args as {
                productName: string;
                limit?: number;
            };
            const cap = rowLimit ?? 10;
            const rows = await prisma.$queryRaw<
                {
                    type: string;
                    quantity: Prisma.Decimal;
                    createdAt: Date;
                    reference: string | null;
                    location: string | null;
                }[]
            >(Prisma.sql`
        SELECT sm.type, sm.quantity, sm."createdAt", sm.reference,
               p.name AS product, l.name AS location
        FROM "StockMovement" sm
        JOIN "ProductVariant" pv ON sm."productVariantId" = pv.id
        JOIN "Product" p ON pv."productId" = p.id
        LEFT JOIN "Location" l ON sm."locationId" = l.id
        WHERE p.name ILIKE ${'%' + productName + '%'}
        ORDER BY sm."createdAt" DESC
        LIMIT ${cap}
      `);

            if (!rows.length) {
                return createEvidence({
                    summary: `Tidak ada riwayat pergerakan stok untuk '${productName}'.`,
                    facts: [{ label: 'Produk', value: productName }],
                    source: 'tenant-data',
                    completeness: 'partial',
                });
            }

            const facts = rows.map(
                (r: {
                    type: string;
                    quantity: Prisma.Decimal;
                    createdAt: Date;
                    reference: string | null;
                    location: string | null;
                }) => ({
                    label: `${r.type} — ${r.location || '-'}`,
                    value: `${Number(r.quantity).toFixed(2)} — ${new Date(r.createdAt).toLocaleDateString('id-ID')} — ${r.reference || '-'}`,
                }),
            );

            return createEvidence({
                summary: `Riwayat pergerakan stok '${productName}' (${rows.length} terakhir):`,
                facts,
                source: 'tenant-data',
            });
        },
    },

    // --- Phase 6: Cross-module diagnosis tools ---

    // diagnose_so_fulfillment
    {
        name: 'diagnose_so_fulfillment',
        description:
            'Diagnosa mengapa Sales Order tidak dapat diproses: cek stok, reservasi, produksi, dan jadwal kirim. Gunakan untuk pertanyaan "kenapa pesanan belum bisa dikirim".',
        requiredResources: ['/sales/orders', '/warehouse/inventory'],
        sensitivity: 'normal',
        inputSchema: z.object({
            searchTerm: z
                .string()
                .min(1, 'Nomor SO atau nama customer harus diisi'),
        }),
        execute: async (args, _ctx): Promise<ToolEvidence> => {
            const { searchTerm } = args as { searchTerm: string };
            const facts: { label: string; value: string }[] = [];
            const entities: {
                type: string;
                id: string;
                label: string;
                href: string;
            }[] = [];
            let hasPartial = false;

            // Step 1: Resolve SO
            const orders = await prisma.$queryRaw<
                {
                    id: string;
                    orderNumber: string;
                    status: string;
                    customer: string | null;
                }[]
            >(Prisma.sql`
        SELECT so.id, so."orderNumber", so.status, c.name AS customer
        FROM "SalesOrder" so
        LEFT JOIN "Customer" c ON so."customerId" = c.id
        WHERE so."orderNumber" ILIKE ${'%' + searchTerm + '%'} OR c.name ILIKE ${'%' + searchTerm + '%'}
        ORDER BY so."createdAt" DESC LIMIT 3
      `);

            if (!orders.length) {
                return createEvidence({
                    summary: `SO dengan kata kunci '${searchTerm}' tidak ditemukan.`,
                    facts: [{ label: 'Pencarian', value: searchTerm }],
                    source: 'tenant-data',
                    completeness: 'partial',
                });
            }

            const order = orders[0];
            facts.push({
                label: 'Status SO',
                value: `${order.orderNumber} [${order.status}] — ${order.customer || 'Guest'}`,
            });
            entities.push({
                type: 'SalesOrder',
                id: order.id,
                label: order.orderNumber,
                href: '/sales/orders',
            });

            // Step 2: Check line items and stock availability
            const items = await prisma.$queryRaw<
                {
                    variant: string;
                    requested: Prisma.Decimal;
                    available: Prisma.Decimal;
                }[]
            >(Prisma.sql`
        SELECT pv.name AS variant, soi.quantity AS requested,
               COALESCE((SELECT SUM(i.quantity) FROM "Inventory" i WHERE i."productVariantId" = soi."productVariantId" AND i.quantity > 0), 0) AS available
        FROM "SalesOrderItem" soi
        JOIN "ProductVariant" pv ON soi."productVariantId" = pv.id
        WHERE soi."salesOrderId" = ${order.id}
      `);

            for (const item of items) {
                const requested = Number(item.requested);
                const available = Number(item.available);
                const status =
                    available >= requested
                        ? '✅ Cukup'
                        : `❌ Kurang ${requested - available}`;
                facts.push({
                    label: `Item: ${item.variant}`,
                    value: `Diminta: ${requested} — Tersedia: ${available} — ${status}`,
                });
                if (available < requested) hasPartial = true;
            }

            // Step 3: Check linked production orders
            const productionOrders = await prisma.$queryRaw<
                { orderNumber: string; status: string }[]
            >(Prisma.sql`
        SELECT po."orderNumber", po.status
        FROM "ProductionOrder" po
        WHERE po."salesOrderId" = ${order.id}
      `);

            if (productionOrders.length > 0) {
                for (const po of productionOrders) {
                    facts.push({
                        label: `Produksi: ${po.orderNumber}`,
                        value: `Status: ${po.status}`,
                    });
                    entities.push({
                        type: 'ProductionOrder',
                        id: po.orderNumber,
                        label: po.orderNumber,
                        href: '/production/orders',
                    });
                }
            } else {
                facts.push({
                    label: 'Produksi',
                    value: 'Tidak ada SPK terkait',
                });
            }

            // Step 4: Check delivery schedule
            const deliveries = await prisma.$queryRaw<
                { orderNumber: string; status: string }[]
            >(Prisma.sql`
        SELECT d."orderNumber", d.status
        FROM "DeliveryOrder" d
        WHERE d."salesOrderId" = ${order.id}
      `);

            if (deliveries.length > 0) {
                for (const d of deliveries) {
                    facts.push({
                        label: `Pengiriman: ${d.orderNumber}`,
                        value: `Status: ${d.status}`,
                    });
                }
            } else {
                facts.push({
                    label: 'Pengiriman',
                    value: 'Belum ada jadwal pengiriman',
                });
            }

            return createEvidence({
                summary: `Diagnosa SO ${order.orderNumber}: ${hasPartial ? 'Ada item dengan stok tidak mencukupi' : 'Stok mencukupi, periksa produksi/pengiriman'}`,
                facts,
                entities,
                source: 'tenant-data',
                completeness: hasPartial ? 'partial' : 'complete',
            });
        },
    },

    // diagnose_stock_discrepancy
    {
        name: 'diagnose_stock_discrepancy',
        description:
            'Diagnosa mengapa stok dianggap kurang padahal ada: cek reservasi, pending SO, dan pergerakan stok.',
        requiredResources: ['/warehouse/inventory', '/sales/orders'],
        sensitivity: 'normal',
        inputSchema: z.object({
            productName: z.string().min(1, 'Nama produk harus diisi'),
        }),
        execute: async (args, _ctx): Promise<ToolEvidence> => {
            const { productName } = args as { productName: string };
            const facts: { label: string; value: string }[] = [];

            // Step 1: Check total stock
            const stockRows = await prisma.$queryRaw<
                { product: string; totalStock: Prisma.Decimal }[]
            >(Prisma.sql`
        SELECT p.name AS product, SUM(i.quantity) AS totalStock
        FROM "Inventory" i
        JOIN "ProductVariant" pv ON i."productVariantId" = pv.id
        JOIN "Product" p ON pv."productId" = p.id
        WHERE pv.name ILIKE ${'%' + productName + '%'} OR p.name ILIKE ${'%' + productName + '%'}
        GROUP BY p.name
      `);

            if (!stockRows.length) {
                return createEvidence({
                    summary: `Produk '${productName}' tidak ditemukan di inventori.`,
                    facts: [{ label: 'Produk', value: productName }],
                    source: 'tenant-data',
                    completeness: 'partial',
                });
            }

            const totalStock = Number(stockRows[0].totalStock);
            facts.push({
                label: 'Total Stok Fisik',
                value: `${totalStock.toFixed(2)}`,
            });

            // Step 2: Check reserved stock (pending SO)
            const reservedRows = await prisma.$queryRaw<
                { reserved: Prisma.Decimal | null }[]
            >(Prisma.sql`
        SELECT SUM(soi.quantity) AS reserved
        FROM "SalesOrderItem" soi
        JOIN "SalesOrder" so ON soi."salesOrderId" = so.id
        JOIN "ProductVariant" pv ON soi."productVariantId" = pv.id
        JOIN "Product" p ON pv."productId" = p.id
        WHERE (pv.name ILIKE ${'%' + productName + '%'} OR p.name ILIKE ${'%' + productName + '%'})
          AND so.status IN ('CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP')
      `);

            const reserved = Number(reservedRows[0]?.reserved || 0);
            facts.push({
                label: 'Stok Terpesan (SO Pending)',
                value: `${reserved.toFixed(2)}`,
            });

            const available = totalStock - reserved;
            facts.push({
                label: 'Stok Tersedia',
                value: `${available.toFixed(2)} ${available < 0 ? '⚠️ NEGATIF' : ''}`,
            });

            if (reserved > 0) {
                facts.push({
                    label: 'Penjelasan',
                    value: `Stok ${totalStock.toFixed(2)} sudah dikurangi ${reserved.toFixed(2)} untuk pesanan lain. Sisa tersedia: ${available.toFixed(2)}`,
                });
            }

            return createEvidence({
                summary: `Analisis stok '${productName}': Total ${totalStock.toFixed(2)}, Terpesan ${reserved.toFixed(2)}, Tersedia ${available.toFixed(2)}`,
                facts,
                source: 'tenant-data',
            });
        },
    },

    // --- Phase 7: HRD / Sensitive domain tools ---

    // get_attendance_summary
    {
        name: 'get_attendance_summary',
        description:
            'Cek ringkasan kehadiran karyawan: hadir, terlambat, tidak hadir. Hanya untuk data diri sendiri atau karyawan yang diizinkan.',
        requiredResources: ['/hrd/attendance'],
        sensitivity: 'personal',
        inputSchema: z.object({
            employeeName: z.string().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
        }),
        execute: async (args, _ctx): Promise<ToolEvidence> => {
            const { employeeName, startDate, endDate } = args as {
                employeeName?: string;
                startDate?: string;
                endDate?: string;
            };
            const from = startDate
                ? new Date(startDate)
                : new Date(new Date().setDate(new Date().getDate() - 30));
            const to = endDate ? new Date(endDate) : new Date();

            const where: {
                date: { gte: Date; lte: Date };
                employee?: { name: { contains: string; mode: 'insensitive' } };
            } = {
                date: { gte: from, lte: to },
            };

            if (employeeName) {
                where.employee = {
                    name: { contains: employeeName, mode: 'insensitive' },
                };
            }

            const rows = await prisma.$queryRaw<
                {
                    employee: string;
                    date: Date;
                    status: string;
                    checkInTime: string | null;
                    checkOutTime: string | null;
                }[]
            >(Prisma.sql`
        SELECT e.name AS employee, a.date, a.status, a."checkInTime", a."checkOutTime"
        FROM "Attendance" a
        JOIN "Employee" e ON a."employeeId" = e.id
        WHERE a.date >= ${from} AND a.date <= ${to}
        ${employeeName ? Prisma.sql`AND e.name ILIKE ${'%' + employeeName + '%'}` : Prisma.empty}
        ORDER BY a.date DESC
        LIMIT 20
      `);

            if (!rows.length) {
                return createEvidence({
                    summary: `Tidak ada data kehadiran${employeeName ? ` untuk '${employeeName}'` : ''} dalam periode tersebut.`,
                    facts: [],
                    source: 'tenant-data',
                    completeness: 'partial',
                });
            }

            const facts = rows.map(
                (r: {
                    employee: string;
                    date: Date;
                    status: string;
                    checkInTime: string | null;
                }) => ({
                    label: `${r.employee} — ${new Date(r.date).toLocaleDateString('id-ID')}`,
                    value: `${r.status} — Masuk: ${r.checkInTime || '-'}`,
                }),
            );

            return createEvidence({
                summary: `Ringkasan kehadiran (${rows.length} catatan):`,
                facts,
                source: 'tenant-data',
            });
        },
    },

    // --- Gap 11: Additional diagnosis workflows ---

    // diagnose_production_blocker
    {
        name: 'diagnose_production_blocker',
        description:
            'Diagnosa mengapa SPK produksi tertahan: cek material, BOM, backflush, dan status.',
        requiredResources: ['/production/orders', '/warehouse/inventory'],
        sensitivity: 'normal',
        inputSchema: z.object({
            searchTerm: z.string().min(1, 'Nomor SPK harus diisi'),
        }),
        execute: async (args, _ctx): Promise<ToolEvidence> => {
            const { searchTerm } = args as { searchTerm: string };
            const facts: { label: string; value: string }[] = [];
            const entities: {
                type: string;
                id: string;
                label: string;
                href: string;
            }[] = [];

            const pos = await prisma.$queryRaw<
                {
                    id: string;
                    orderNumber: string;
                    status: string;
                    plannedQuantity: Prisma.Decimal;
                    actualQuantity: Prisma.Decimal | null;
                    bomId: string;
                    product: string;
                }[]
            >(Prisma.sql`
        SELECT po.id, po."orderNumber", po.status, po."plannedQuantity", po."actualQuantity",
               b.id AS "bomId", p.name AS product
        FROM "ProductionOrder" po
        JOIN "Bom" b ON po."bomId" = b.id
        JOIN "ProductVariant" pv ON b."productVariantId" = pv.id
        JOIN "Product" p ON pv."productId" = p.id
        WHERE po."orderNumber" ILIKE ${'%' + searchTerm + '%'}
        ORDER BY po."createdAt" DESC LIMIT 1
      `);

            if (!pos.length) {
                return createEvidence({
                    summary: `SPK dengan kata kunci '${searchTerm}' tidak ditemukan.`,
                    facts: [{ label: 'Pencarian', value: searchTerm }],
                    source: 'tenant-data',
                    completeness: 'partial',
                });
            }

            const po = pos[0];
            facts.push({
                label: 'Status SPK',
                value: `${po.orderNumber} [${po.status}] — ${po.product}`,
            });
            facts.push({
                label: 'Target vs Aktual',
                value: `Target: ${Number(po.plannedQuantity).toFixed(2)} — Aktual: ${Number(po.actualQuantity || 0).toFixed(2)}`,
            });
            entities.push({
                type: 'ProductionOrder',
                id: po.id,
                label: po.orderNumber,
                href: '/production/orders',
            });

            // Check BOM materials
            const bomItems = await prisma.$queryRaw<
                {
                    material: string;
                    required: Prisma.Decimal;
                    available: Prisma.Decimal;
                }[]
            >(Prisma.sql`
        SELECT p.name AS material, bi.quantity AS required,
               COALESCE((SELECT SUM(i.quantity) FROM "Inventory" i WHERE i."productVariantId" = bi."productVariantId" AND i.quantity > 0), 0) AS available
        FROM "BomItem" bi
        JOIN "ProductVariant" pv ON bi."productVariantId" = pv.id
        JOIN "Product" p ON pv."productId" = p.id
        WHERE bi."bomId" = ${po.bomId}
      `);

            let hasShortage = false;
            for (const item of bomItems) {
                const required = Number(item.required);
                const available = Number(item.available);
                const status =
                    available >= required
                        ? '✅'
                        : `❌ Kurang ${required - available}`;
                facts.push({
                    label: `Material: ${item.material}`,
                    value: `Diperlukan: ${required} — Tersedia: ${available} — ${status}`,
                });
                if (available < required) hasShortage = true;
            }

            return createEvidence({
                summary: `Diagnosa SPK ${po.orderNumber}: ${hasShortage ? 'Ada material yang kurang' : 'Material mencukupi, periksa mesin/jadwal'}`,
                facts,
                entities,
                source: 'tenant-data',
                completeness: hasShortage ? 'partial' : 'complete',
            });
        },
    },

    // diagnose_po_invoice_mismatch
    {
        name: 'diagnose_po_invoice_mismatch',
        description:
            'Diagnosa mengapa PO belum bisa di-invoice: cek goods receipt, variance, dan status.',
        requiredResources: ['/purchasing/orders', '/finance/invoices/purchase'],
        sensitivity: 'financial',
        inputSchema: z.object({
            searchTerm: z.string().min(1, 'Nomor PO harus diisi'),
        }),
        execute: async (args, _ctx): Promise<ToolEvidence> => {
            const { searchTerm } = args as { searchTerm: string };
            const facts: { label: string; value: string }[] = [];
            const entities: {
                type: string;
                id: string;
                label: string;
                href: string;
            }[] = [];

            const pos = await prisma.$queryRaw<
                {
                    id: string;
                    orderNumber: string;
                    status: string;
                    totalAmount: Prisma.Decimal;
                    supplier: string | null;
                }[]
            >(Prisma.sql`
        SELECT po.id, po."orderNumber", po.status, po."totalAmount",
               s.name AS supplier
        FROM "PurchaseOrder" po
        LEFT JOIN "Supplier" s ON po."supplierId" = s.id
        WHERE po."orderNumber" ILIKE ${'%' + searchTerm + '%'}
        ORDER BY po."createdAt" DESC LIMIT 1
      `);

            if (!pos.length) {
                return createEvidence({
                    summary: `PO dengan kata kunci '${searchTerm}' tidak ditemukan.`,
                    facts: [{ label: 'Pencarian', value: searchTerm }],
                    source: 'tenant-data',
                    completeness: 'partial',
                });
            }

            const po = pos[0];
            facts.push({
                label: 'Status PO',
                value: `${po.orderNumber} [${po.status}] — ${po.supplier || '-'}`,
            });
            facts.push({
                label: 'Total Amount',
                value: formatCurrency(Number(po.totalAmount)),
            });
            entities.push({
                type: 'PurchaseOrder',
                id: po.id,
                label: po.orderNumber,
                href: '/purchasing/orders',
            });

            // Check goods receipts
            const receipts = await prisma.$queryRaw<
                {
                    id: string;
                    receiptNumber: string;
                    status: string;
                    totalAmount: Prisma.Decimal;
                }[]
            >(Prisma.sql`
        SELECT gr.id, gr."receiptNumber", gr.status, gr."totalAmount"
        FROM "GoodsReceipt" gr
        WHERE gr."purchaseOrderId" = ${po.id}
      `);

            if (receipts.length > 0) {
                for (const r of receipts) {
                    facts.push({
                        label: `Receipt: ${r.receiptNumber}`,
                        value: `${r.status} — ${formatCurrency(Number(r.totalAmount))}`,
                    });
                }
            } else {
                facts.push({
                    label: 'Goods Receipt',
                    value: 'Belum ada penerimaan barang',
                });
            }

            // Check linked invoices
            const invoices = await prisma.$queryRaw<
                { id: string; invoiceNumber: string; status: string }[]
            >(Prisma.sql`
        SELECT pi.id, pi."invoiceNumber", pi.status
        FROM "PurchaseInvoice" pi
        WHERE pi."purchaseOrderId" = ${po.id}
      `);

            if (invoices.length > 0) {
                for (const inv of invoices) {
                    facts.push({
                        label: `Invoice: ${inv.invoiceNumber}`,
                        value: inv.status,
                    });
                }
            } else {
                facts.push({ label: 'Invoice', value: 'Belum ada invoice' });
            }

            return createEvidence({
                summary: `Diagnosa PO ${po.orderNumber}: ${receipts.length === 0 ? 'Belum ada penerimaan barang' : receipts.length + ' receipt ditemukan, ' + invoices.length + ' invoice'}`,
                facts,
                entities,
                source: 'tenant-data',
            });
        },
    },

    // diagnose_invoice_payment
    {
        name: 'diagnose_invoice_payment',
        description:
            'Diagnosa mengapa invoice tampak belum lunas: cek payment allocation, amount, dan status.',
        requiredResources: ['/finance/invoices/sales'],
        sensitivity: 'financial',
        inputSchema: z.object({
            searchTerm: z.string().min(1, 'Nomor invoice harus diisi'),
        }),
        execute: async (args, _ctx): Promise<ToolEvidence> => {
            const { searchTerm } = args as { searchTerm: string };
            const facts: { label: string; value: string }[] = [];
            const entities: {
                type: string;
                id: string;
                label: string;
                href: string;
            }[] = [];

            const invoices = await prisma.$queryRaw<
                {
                    id: string;
                    invoiceNumber: string;
                    status: string;
                    totalAmount: Prisma.Decimal;
                    paidAmount: Prisma.Decimal;
                    dueDate: Date | null;
                    customer: string | null;
                }[]
            >(Prisma.sql`
        SELECT i.id, i."invoiceNumber", i.status, i."totalAmount", i."paidAmount", i."dueDate",
               c.name AS customer
        FROM "Invoice" i
        LEFT JOIN "Customer" c ON i."customerId" = c.id
        WHERE i."invoiceNumber" ILIKE ${'%' + searchTerm + '%'}
        ORDER BY i."createdAt" DESC LIMIT 1
      `);

            if (!invoices.length) {
                return createEvidence({
                    summary: `Invoice dengan kata kunci '${searchTerm}' tidak ditemukan.`,
                    facts: [{ label: 'Pencarian', value: searchTerm }],
                    source: 'tenant-data',
                    completeness: 'partial',
                });
            }

            const inv = invoices[0];
            const total = Number(inv.totalAmount);
            const paid = Number(inv.paidAmount);
            const remaining = total - paid;

            facts.push({
                label: 'Status Invoice',
                value: `${inv.invoiceNumber} [${inv.status}] — ${inv.customer || '-'}`,
            });
            facts.push({ label: 'Total Amount', value: formatCurrency(total) });
            facts.push({ label: 'Paid Amount', value: formatCurrency(paid) });
            facts.push({
                label: 'Remaining',
                value: formatCurrency(remaining),
            });
            facts.push({
                label: 'Due Date',
                value: inv.dueDate
                    ? new Date(inv.dueDate).toLocaleDateString('id-ID')
                    : '-',
            });
            entities.push({
                type: 'Invoice',
                id: inv.id,
                label: inv.invoiceNumber,
                href: '/finance/invoices/sales',
            });

            // Check payment allocations
            const payments = await prisma.$queryRaw<
                {
                    id: string;
                    paymentId: string;
                    amount: Prisma.Decimal;
                    paymentNumber: string;
                    status: string;
                }[]
            >(Prisma.sql`
        SELECT pa.id, pa."paymentId", pa.amount, p."paymentNumber", p.status
        FROM "PaymentAllocation" pa
        JOIN "Payment" p ON pa."paymentId" = p.id
        WHERE pa."invoiceId" = ${inv.id}
      `);

            if (payments.length > 0) {
                for (const pmt of payments) {
                    facts.push({
                        label: `Payment: ${pmt.paymentNumber}`,
                        value: `${formatCurrency(Number(pmt.amount))} — ${pmt.status}`,
                    });
                }
            } else {
                facts.push({
                    label: 'Payments',
                    value: 'Tidak ada pembayaran tercatat',
                });
            }

            const diagnosis =
                remaining <= 0
                    ? 'Invoice sudah lunas'
                    : payments.length === 0
                      ? 'Belum ada pembayaran'
                      : `Sisa ${formatCurrency(remaining)} belum teralokasi`;

            return createEvidence({
                summary: `Diagnosa Invoice ${inv.invoiceNumber}: ${diagnosis}`,
                facts,
                entities,
                source: 'tenant-data',
            });
        },
    },
];

/**
 * Get the OpenAI-compatible tool definitions for a given user context.
 * Only tools the user is authorized to use are included.
 */
export function getToolsForContext(
    context: AssistantUserContext,
): AssistantToolDefinition[] {
    return toolRegistry.filter((tool) => {
        const result = checkToolAuthorization(tool, context);
        return result.allowed;
    });
}

/**
 * Get a single tool by name from the registry.
 */
export function getToolByName(
    name: string,
): AssistantToolDefinition | undefined {
    return toolRegistry.find((t) => t.name === name);
}

/**
 * Convert tool definitions to OpenAI Chat Completion tool format.
 */
export function toolsToOpenAiFormat(tools: AssistantToolDefinition[]): Array<{
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters?: Record<string, unknown>;
    };
}> {
    return tools.map((tool) => ({
        type: 'function' as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters:
                tool.inputSchema instanceof z.ZodObject
                    ? zodSchemaToOpenAi(tool.inputSchema)
                    : undefined,
        },
    }));
}

/**
 * Convert a Zod schema to OpenAI-style parameters object.
 */
function zodSchemaToOpenAi(
    schema: z.ZodObject<z.ZodRawShape>,
): Record<string, unknown> {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
        if (value instanceof z.ZodString) {
            properties[key] = {
                type: 'string',
                description: value.description,
            };
            if (!value.isOptional()) required.push(key);
        } else if (value instanceof z.ZodNumber) {
            properties[key] = {
                type: 'number',
                description: value.description,
            };
            if (!value.isOptional()) required.push(key);
        } else if (value instanceof z.ZodBoolean) {
            properties[key] = {
                type: 'boolean',
                description: value.description,
            };
            if (!value.isOptional()) required.push(key);
        }
    }

    return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
    };
}
