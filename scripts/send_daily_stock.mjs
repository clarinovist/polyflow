import { execSync } from 'child_process';

const BOT_TOKEN = '8542521615:AAHxxHloS2P9IucDu1t1Slp7vxpBxCuqWPY';
const CHAT_ID = '-5255163640';

let rawData = '';

try {
  const sql = `
    SELECT json_agg(t) FROM (
      SELECT p.name AS product, l.name AS location, SUM(i.quantity) as quantity
      FROM "Inventory" i
      JOIN "ProductVariant" pv ON i."productVariantId" = pv.id
      JOIN "Product" p ON pv."productId" = p.id
      JOIN "Location" l ON i."locationId" = l.id
      WHERE i.quantity > 0
      GROUP BY p.name, l.name
      ORDER BY l.name, SUM(i.quantity) DESC
    ) t;
  `;
  
  const output = execSync(`docker exec polyflow-db psql -U polyflow -d polyflow -A -t -c '${sql}'`, { maxBuffer: 1024 * 1024 * 50 });
  rawData = output.toString().trim();
  
  if (!rawData || rawData === 'null') {
    console.log('No stock data available or empty.');
    process.exit(0);
  }
} catch (error) {
  console.error('Failed to query database:', error.message);
  process.exit(1);
}

let stockData = [];
try {
  stockData = JSON.parse(rawData);
} catch (error) {
  console.error('Failed to parse JSON string:', error.message);
  process.exit(1);
}

// Group by location (Warehouse)
const byLocation = {};
for (const item of stockData) {
  if (!byLocation[item.location]) {
    byLocation[item.location] = [];
  }
  byLocation[item.location].push(item);
}

const dateStr = new Date().toLocaleDateString('id-ID', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const sendToTelegram = async (text) => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        parse_mode: 'Markdown'
      })
    });
    const result = await response.json();
    if (!result.ok) {
      console.error('Telegram API Error:', result);
    } else {
      console.log('Message sent successfully!');
    }
  } catch (err) {
    console.error('Failed to send HTTP request to Telegram:', err.message);
  }
};

const main = async () => {
  // Intro message
  const introMsg = `📊 *Daily Stock Update - PolyFlow*\n📅 ${dateStr}\n\n_Berikut laporan stok hari ini (Diurutkan dari tertinggi)._`;
  await sendToTelegram(introMsg);
  await new Promise(r => setTimeout(r, 500));

  // One message per Location
  for (const [location, items] of Object.entries(byLocation)) {
    let msg = `===========================\n🏢 *${location}*\n===========================\n\n`;
    
    for (const item of items) {
      msg += `▪️ ${item.product} = ${Number(item.quantity).toFixed(2)}\n`;
    }
    
    const chunks = msg.match(/[\s\S]{1,4000}/g) || [];
    for (const chunk of chunks) {
      await sendToTelegram(chunk);
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  await sendToTelegram(`_🤖 Semua Rekap Gudang selesai dikirim._`);
};

main();
