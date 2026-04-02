#!/usr/bin/env node

/**
 * Example Router: OpenClaw Telegram -> Legacy Ops or Polyflow Virtual CS.
 *
 * This is a reference file and does not replace existing automation.
 */

import { spawnSync } from 'child_process';

const LEGACY_COMMANDS = new Map([
  ['/stok', ['node', ['scripts/send_daily_stock.mjs']]],
  ['/stok_kritis', ['node', ['scripts/telegram_cmd.mjs', 'stok_kritis']]],
  ['/produksi_aktif', ['node', ['scripts/telegram_cmd.mjs', 'produksi_aktif']]],
  ['/pending_sales', ['node', ['scripts/telegram_cmd.mjs', 'pending_sales']]],
  ['/mutasi_hari_ini', ['node', ['scripts/telegram_cmd.mjs', 'mutasi']]],
  ['/finance_summary', ['node', ['scripts/telegram_cmd.mjs', 'finance']]],
]);

function runCmd(bin, args) {
  const result = spawnSync(bin, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${bin} ${args.join(' ')}`);
  }
}

function main() {
  const incomingText = (process.argv[2] || '').trim();
  const requesterName = (process.argv[3] || '').trim();

  if (!incomingText) {
    console.error('Usage: node scripts/openclaw_router_polyflow_example.mjs "<text>" "<requesterName?>"');
    process.exit(1);
  }

  const [bin, args] = LEGACY_COMMANDS.get(incomingText) || [];

  // Keep legacy operation flow untouched.
  if (bin && args) {
    runCmd(bin, args);
    return;
  }

  // Route non-legacy text to Polyflow Virtual CS bridge.
  runCmd('node', ['scripts/openclaw_polyflow_bridge.mjs', incomingText, requesterName]);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
