import { execSync } from 'child_process';
import fs from 'fs';

// ponytail: direct docker exec psql bypass tenant isolation & service registry.
// ceiling: env-only token + no hardcoded secrets. Upgrade: remove this script entirely and use
// src/lib/telegram/notification-service + tool-registry in Phase 2.
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-5255163640';

if (!BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN env required. Refusing to use hardcoded token.');
  process.exit(1);
}

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.error('Please provide a command argument.');
  process.exit(1);
}

const sendToTelegram = async (text) => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: text, parse_mode: 'Markdown' })
    });
    if (!response.ok) {
      console.error('Telegram API Error:', await response.text());
    }
  } catch (err) {
    console.error('Failed to send request:', err.message);
  }
};

const runSQL = (query) => {
  try {
    fs.writeFileSync('/tmp/polyflow_query.sql', query);
    const output = execSync(`docker exec -i polyflow-db psql -U polyflow -d polyflow -A -t < /tmp/polyflow_query.sql`, { maxBuffer: 1024 * 1024 * 50 });
    const raw = output.toString().trim();
    if (!raw || raw === 'null') return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('DB Error:', err.message);
    return [];
  }
};

const runScalar = (query) => {
  try {
    fs.writeFileSync('/tmp/polyflow_query_scalar.sql', query);
    const output = execSync(`docker exec -i polyflow-db psql -U polyflow -d polyflow -A -t < /tmp/polyflow_query_scalar.sql`, { maxBuffer: 1024 * 1024 * 5 });
    return output.toString().trim();
  } catch (err) {
    console.error('DB Scalar Error:', err.message);
    return '0';
  }
};

let msg = '';

switch (command) {
  case 'stok_kritis': {
    const sql = `
      SELECT json_agg(t) FROM (
        SELECT p.name AS product, SUM(i.quantity) as qty
        FROM "Inventory" i
        JOIN "ProductVariant" pv ON i."productVariantId" = pv.id
        JOIN "Product" p ON pv."productId" = p.id
        GROUP BY p.name
        HAVING SUM(i.quantity) < SUM(pv."minStockAlert") AND SUM(pv."minStockAlert") > 0
        ORDER BY qty ASC
      ) t;
    `;
    const data = runSQL(sql);
    msg = `🚨 *Peringatan Stok Kritis & Menipis*\n===========================\n\n`;
    if (data.length === 0) {
      msg += `✅ Semua stok pabrik dalam batas aman!\n`;
    } else {
      for (const d of data) {
        msg += `▪️ ${d.product} = ${Number(d.qty).toFixed(2)}\n`;
      }
    }
    break;
  }
  
  case 'produksi_aktif': {
    const sql = `
      SELECT json_agg(t) FROM (
        SELECT po."orderNumber", p.name AS product, po."plannedQuantity" as target, m.name as machine
        FROM "ProductionOrder" po
        JOIN "Bom" b ON po."bomId" = b.id
        JOIN "ProductVariant" pv ON b."productVariantId" = pv.id
        JOIN "Product" p ON pv."productId" = p.id
        LEFT JOIN "Machine" m ON po."machineId" = m.id
        WHERE po.status = 'IN_PROGRESS'
        ORDER BY po."actualStartDate" DESC NULLS LAST
      ) t;
    `;
    const data = runSQL(sql);
    msg = `⚙️ *Daftar SPK Produksi Berjalan*\n===========================\n\n`;
    if (data.length === 0) {
      msg += `💤 Tidak ada produksi (SPK) yang aktif saat ini.\n`;
    } else {
      for (const d of data) {
        msg += `🏭 *${d.orderNumber}* — Mesin: ${d.machine || 'N/A'}\n`;
        msg += `   ▪️ ${d.product}\n`;
        msg += `   🎯 Target Qty: *${Number(d.target).toFixed(2)}*\n\n`;
      }
    }
    break;
  }

  case 'pending_sales': {
    const sql = `
      SELECT json_agg(t) FROM (
        SELECT so."orderNumber", c.name as customer, so."totalAmount" as total
        FROM "SalesOrder" so
        LEFT JOIN "Customer" c ON so."customerId" = c.id
        WHERE so.status IN ('CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP')
        ORDER BY so."orderDate" ASC
      ) t;
    `;
    const data = runSQL(sql);
    msg = `🚚 *Daftar Pesanan Belum Terkirim (SO pending)*\n===========================\n\n`;
    if (data.length === 0) {
      msg += `📦 Tidak ada pesanan tertunda. Semua Sales Order sudah dipenuhi!\n`;
    } else {
      for (const d of data) {
        msg += `▪️ *${d.orderNumber}* — Klien: *${d.customer || 'Guest'}*\n`;
        msg += `   💰 Nilai Transaksi: Rp ${Number(d.total).toLocaleString('id-ID')}\n`;
      }
    }
    break;
  }

  case 'mutasi': {
    const sql = `
      SELECT json_agg(t) FROM (
        SELECT type, SUM(quantity) as qty, COUNT(*) as tx_count
        FROM "StockMovement"
        WHERE DATE("createdAt") = CURRENT_DATE
        GROUP BY type
      ) t;
    `;
    const data = runSQL(sql);
    msg = `📦 *Ringkasan Mutasi Stok Hari Ini*\n===========================\n\n`;
    if (data.length === 0) {
      msg += `📌 Belum ada pergerakan stok (Barang Masuk/Keluar) hari ini.\n`;
    } else {
      for (const d of data) {
        msg += `▪️ Tipe: *${d.type}*\n`;
        msg += `   Tercatat: ${d.tx_count} transaksi | Qty: *${Number(d.qty).toFixed(2)}*\n`;
      }
    }
    break;
  }

  case 'finance': {
    const sqlAR = `SELECT COALESCE(SUM("totalAmount" - "paidAmount"), 0) FROM "Invoice" WHERE status IN ('UNPAID', 'PARTIAL', 'OVERDUE')`;
    const sqlAP = `SELECT COALESCE(SUM("totalAmount" - "paidAmount"), 0) FROM "PurchaseInvoice" WHERE status IN ('UNPAID', 'PARTIAL', 'OVERDUE')`;
    
    let arVal = Number(runScalar(sqlAR)) || 0;
    let apVal = Number(runScalar(sqlAP)) || 0;
    
    msg = `💵 *Finance Summary (Outstanding)*\n===========================\n\n`;
    msg += `📈 *Tagihan Belum Lunas (Piutang Klien)*\n`;
    msg += `   Rp ${arVal.toLocaleString('id-ID')}\n\n`;
    msg += `📉 *Hutang Usaha Belum Dibayar (Supplier)*\n`;
    msg += `   Rp ${apVal.toLocaleString('id-ID')}\n`;
    msg += `\n_Catatan: Data ditarik langsung dari modul Invoice Polyflow._`;
    break;
  }

  default:
    console.log('Command not recognized.');
    process.exit(1);
}

// Send the message
const chunks = msg.match(/[\s\S]{1,4000}/g) || [];
(async () => {
    for (const chunk of chunks) {
      await sendToTelegram(chunk);
    }
})();
