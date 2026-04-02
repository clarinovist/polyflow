#!/usr/bin/env node

/**
 * OpenClaw -> Polyflow bridge helper.
 *
 * Usage:
 *   node scripts/openclaw_polyflow_bridge.mjs "stok kritis hari ini bagaimana?" "Budi"
 */

const [questionArg, requesterNameArg] = process.argv.slice(2);
const question = (questionArg || '').trim();
const requesterName = (requesterNameArg || '').trim();

if (!question) {
  console.error('Usage: node scripts/openclaw_polyflow_bridge.mjs "<question>" "<requesterName?>"');
  process.exit(1);
}

const baseUrl = (process.env.POLYFLOW_INTERNAL_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const apiKey = process.env.POLYFLOW_OPENCLAW_API_KEY || '';

if (!apiKey) {
  console.error('Missing env POLYFLOW_OPENCLAW_API_KEY');
  process.exit(1);
}

const endpoint = `${baseUrl}/api/bot/query?product=polyflow`;

try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
      'x-openclaw-product': 'polyflow',
    },
    body: JSON.stringify({ question, requesterName }),
  });

  const json = await res.json();

  if (!res.ok || !json?.success) {
    console.error('Bridge request failed:', json?.error || `HTTP ${res.status}`);
    process.exit(1);
  }

  const answer = json?.data?.answer || 'Tidak ada jawaban.';
  process.stdout.write(answer + '\n');
} catch (error) {
  console.error('Bridge request error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
