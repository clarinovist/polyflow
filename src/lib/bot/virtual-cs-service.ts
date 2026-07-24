import { prisma } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';
import { enforceGuardrails } from './guardrails';
import { searchHelpArticles } from './help-articles';
import OpenAI from 'openai';

const AGENTIC_DEBUG = process.env.AGENTIC_DEBUG === 'true';

export type VirtualCsRequest = {
  question: string;
  channel: 'telegram' | 'web';
  requesterName?: string;
};

export type CitedArticleForResponse = {
  slug: string;
  title: string;
  summary?: string;
};

export type VirtualCsResponse = {
  answer: string;
  citations: string[];
  citedArticles?: CitedArticleForResponse[];
  safety: {
    allowed: boolean;
    blockedReason?: string;
  };
};

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// ------ NEW TOOLS ------

async function getProductStock(productName: string): Promise<string> {
  const rows = await prisma.$queryRaw<StockRow[]>(Prisma.sql`
    SELECT p.name AS product, l.name AS location, COALESCE(SUM(i.quantity), 0) AS quantity
    FROM "Inventory" i
    JOIN "ProductVariant" pv ON i."productVariantId" = pv.id
    JOIN "Product" p ON pv."productId" = p.id
    JOIN "Location" l ON i."locationId" = l.id
    WHERE pv.name ILIKE ${'%' + productName + '%'} OR p.name ILIKE ${'%' + productName + '%'}
    GROUP BY p.name, l.name
    ORDER BY SUM(i.quantity) DESC
  `);
  if (!rows.length) return `Stok untuk produk '${productName}' tidak ditemukan atau kosong.`;
  const lines = rows.map((row) => `- Produksi/Tipe: ${row.product} | Lokasi: ${row.location} | Qty Fisik: ${Number(row.quantity).toFixed(2)} KG`);
  return `Informasi stok fisik untuk produk '${productName}':\n${lines.join('\n')}`;
}

async function getSalesOrderLines(searchTerm: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT so.id, so."orderNumber", c.name as customer, so.status
    FROM "SalesOrder" so
    LEFT JOIN "Customer" c ON so."customerId" = c.id
    WHERE so."orderNumber" ILIKE ${'%' + searchTerm + '%'} OR c.name ILIKE ${'%' + searchTerm + '%'} OR so."id" = ${searchTerm}
    ORDER BY so."createdAt" DESC
    LIMIT 3
  `);
  
  if (!orders.length) return `Sales Order dengan kata kunci '${searchTerm}' tidak ditemukan.`;

  let resultString = '';
  for (const order of orders) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT pv.name as variant, soi.quantity 
      FROM "SalesOrderItem" soi
      JOIN "ProductVariant" pv ON soi."productVariantId" = pv.id
      WHERE soi."salesOrderId" = ${order.id as string}
    `);
    resultString += `\n[Order: ${order.orderNumber} | Kustomer: ${order.customer || '-'} | Status: ${order.status}]\n`;
    items.forEach(item => {
      resultString += `- Item: ${item.variant} | Qty Diminta: ${Number(item.quantity).toFixed(2)} KG\n`;
    });
  }
  return resultString;
}

const agentTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_product_stock",
      description: "Ambil informasi stok fisik yang tersedia untuk sebuah produk secara spesifik. Berguna ketika memeriksa stok.",
      parameters: {
        type: "object",
        properties: {
          productName: { type: "string", description: "Nama atau kode produk (misal: 'MP 15' atau 'Affal Daun')" }
        },
        required: ["productName"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_sales_order_lines",
      description: "Ambil detail barang (line item) dan kuantitas yang diminta dalam sebuah Sales Order. Berguna ketika menganalisis mengapa pesanan gagal atau inventory insufficient.",
      parameters: {
        type: "object",
        properties: {
          searchTerm: { type: "string", description: "Nomor order SO atau nama kustomer (misal: 'SO-2026-0001' atau '191cecb1')" }
        },
        required: ["searchTerm"]
      }
    }
  },
  {
    type: "function",
    function: { name: "get_finance_summary", description: "Ringkasan utang/piutang (finance)." }
  },
  {
    type: "function",
    function: { name: "get_active_production", description: "Daftar SPK/produksi aktif." }
  },
  {
    type: "function",
    function: { name: "get_general_stock_overview", description: "Ranking 12 stok terbanyak saat ini di gudang secara umum." }
  },
  {
    type: "function",
    function: { name: "get_critical_stock_overview", description: "Daftar produk yang stoknya kurang dari nilai ambang batas minimum." }
  },
  {
    type: "function",
    function: { name: "get_pending_sales_overview", description: "Daftar ringkas sales orders yang statusnya belum selesai." }
  },
  {
    type: "function",
    function: {
      name: "search_help_articles",
      description: "Cari artikel panduan / FAQ / troubleshooting dari Knowledge Base. WAJIB gunakan tool ini untuk pertanyaan 'cara pakai', 'bagaimana cara', 'tutorial', atau troubleshooting sebelum menjawab sendiri. Hasil berisi judul, slug (untuk link), dan ringkasan.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Kata kunci pencarian (misal: 'buat sales order', 'stok kurang', 'input SPK')" },
          module: { type: "string", description: "Filter modul opsional: sales, warehouse, production, finance, hrd, purchasing, access, global" }
        },
        required: ["query"]
      }
    }
  }
];

async function handleSearchHelpArticles(query: string, module?: string): Promise<string> {
  const results = await searchHelpArticles(query, module, 5);
  if (!results.length) {
    return 'Tidak ditemukan artikel yang relevan di Knowledge Base.';
  }
  const lines = results.map((r, i) => {
    const link = `/support/${r.slug}`;
    return `${i + 1}. **${r.title}** (${r.modules.join(', ')})\n   ${r.summary}\n   Link: ${link}`;
  });
  return `Artikel ditemukan di Knowledge Base:\n\n${lines.join('\n\n')}`;
}

type SearchToolResult = { text: string; articles: CitedArticleForResponse[] };

async function handleSearchHelpArticlesWithMeta(query: string, module?: string): Promise<SearchToolResult> {
  const results = await searchHelpArticles(query, module, 5);
  if (!results.length) {
    return { text: 'Tidak ditemukan artikel yang relevan di Knowledge Base.', articles: [] };
  }
  const articles: CitedArticleForResponse[] = results.map((r) => ({
    slug: r.slug,
    title: r.title,
    summary: r.summary?.slice(0, 120),
  }));
  const lines = results.map((r, i) => {
    const link = `/support/${r.slug}`;
    return `${i + 1}. **${r.title}** (${r.modules.join(', ')})\n   ${r.summary}\n   Link: ${link}`;
  });
  return { text: `Artikel ditemukan di Knowledge Base:\n\n${lines.join('\n\n')}`, articles };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleToolCall(name: string, args: any): Promise<string> {
  try {
    switch (name) {
      case 'get_product_stock': return await getProductStock(args.productName || '');
      case 'get_sales_order_lines': return await getSalesOrderLines(args.searchTerm || '');
      case 'get_finance_summary': return await getFinanceSummary();
      case 'get_active_production': return await getActiveProduction();
      case 'get_general_stock_overview': return await getStockOverview();
      case 'get_critical_stock_overview': return await getCriticalStock();
      case 'get_pending_sales_overview': return await getPendingSales();
      case 'search_help_articles': return await handleSearchHelpArticles(args.query || '', args.module);
      default: return `Error: Tool '${name}' tidak dikenali.`;
    }
  } catch(e) {
    return `Error executing tool ${name}: ${e instanceof Error ? e.message : 'Unknown error'}`;
  }
}

// Variant that also returns structured articles for citation cards
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleToolCallWithMeta(name: string, args: any): Promise<{ text: string; citedArticles: CitedArticleForResponse[] }> {
  try {
    if (name === 'search_help_articles') {
      const res = await handleSearchHelpArticlesWithMeta(args.query || '', args.module);
      return { text: res.text, citedArticles: res.articles };
    }
    const text = await handleToolCall(name, args);
    return { text, citedArticles: [] };
  } catch (e) {
    return { text: `Error executing tool ${name}: ${e instanceof Error ? e.message : 'Unknown error'}`, citedArticles: [] };
  }
}

// ------ END NEW TOOLS ------

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

  const openai = new OpenAI({
    apiKey: process.env.LLM_API_KEY || '',
    baseURL: process.env.LLM_BASE_URL || 'http://localhost:11434/v1',
  });

  const greeting = input.requesterName ? `Sapa user dengan nama ${input.requesterName} di awal pesan Anda.` : '';

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `Anda adalah Virtual CS Polyflow, ERP pabrik plastik. Gunakan bahasa Indonesia yang ramah dan profesional.
Anda dilengkapi dengan TOOLS untuk mengecek database operasional pabrik DAN mencari artikel panduan dari Knowledge Base.
${greeting}

Aturan Agentic:
1. JIKA user bertanya CARA PAKAI / tutorial / "bagaimana cara" / troubleshooting → WAJIB panggil search_help_articles DULU, lalu jawab berdasarkan hasil + sebutkan judul artikel. Jangan hallucinate langkah jika KB punya jawaban.
2. JIKA user bertanya info spesifik data (ex: kenapa order Budi gagal, cek stok MP 15), panggil tools data (get_product_stock, get_sales_order_lines, dll).
3. Jika perlu investigasi (seperti insufficient stock), hubungkan data dari get_sales_order_lines lalu bandingkan dengan get_product_stock. 
   PERHATIAN! Sebuah pesanan bisa memiliki beberapa baris produk yang sama. Jumlahkan total pesanan tersebut BUKAN dari satu baris, lalu bandingkan dengan total inventori fisik!
4. Jika tools tidak menemukan data yang cukup untuk menjawab, akui keterbatasan tersebut.
5. Anda read-only. Operasional perubahan data harus dilakukan manual melalui aplikasi UI Polyflow.
6. Saat mengutip artikel, sebutkan judul dan sarankan user membuka link /support/{slug} untuk panduan lengkap.`
    },
    { role: 'user', content: input.question }
  ];

  try {
    let finalAnswer = '';
    const collectedCited: CitedArticleForResponse[] = [];

    // Agentic Loop (max 4 iteration to avoid infinite loops)
    for (let loop = 0; loop < 4; loop++) {
      const completion = await openai.chat.completions.create({
        model: process.env.LLM_MODEL || 'deepseek-r1:7b',
        messages: messages,
        temperature: 0.2,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: agentTools as any,
        tool_choice: 'auto'
      });

      const responseMessage = completion.choices[0]?.message;
      if (!responseMessage) break;

      messages.push(responseMessage);

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        for (const toolCall of responseMessage.tool_calls) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fn = (toolCall as any).function;
          const args = JSON.parse(fn.arguments || '{}');
          if (AGENTIC_DEBUG) {
            console.debug(`[AGENTIC] Calling tool: ${fn.name} with args:`, args);
          }
          const result = await handleToolCallWithMeta(fn.name, args);
          for (const ca of result.citedArticles) {
            if (!collectedCited.some((c) => c.slug === ca.slug)) {
              collectedCited.push(ca);
            }
          }
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result.text
          } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);
        }
      } else {
        finalAnswer = responseMessage.content?.trim() || '';
        break;
      }
    }

    const citedArticles = collectedCited.slice(0, 3);

    return {
      answer: finalAnswer || 'Maaf, saya tidak dapat merangkum analisis pada saat ini.',
      citations: ['db:polyflow-agentic', 'api:openrouter-tools'],
      citedArticles,
      safety: { allowed: true },
    };
  } catch (error) {
    const e = error as Error;
    console.error('[OPENROUTER/LLM] Failed:', e?.message || e);
    return {
      answer: 'Maaf, saya sedang mengalami gangguan koneksi (Network Error) ke OpenRouter Agent Network. Silakan coba lagi nanti.',
      citations: [],
      safety: {
        allowed: false,
        blockedReason: 'LLM Provider / Network Error',
      },
    };
  }
}
