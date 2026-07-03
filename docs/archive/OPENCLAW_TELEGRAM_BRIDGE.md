# OpenClaw Telegram Bridge for Polyflow

Bridge ini dipakai untuk meneruskan pertanyaan Telegram OpenClaw ke endpoint brain Polyflow tanpa mengubah flow command legacy Telegram yang sudah berjalan.

## Script

Gunakan script:

- `scripts/openclaw_polyflow_bridge.mjs`

Contoh:

```bash
POLYFLOW_INTERNAL_BASE_URL="http://127.0.0.1:3000" \
POLYFLOW_OPENCLAW_API_KEY="<api-key-polyflow>" \
node scripts/openclaw_polyflow_bridge.mjs "stok kritis hari ini bagaimana?" "Budi"
```

Output script adalah teks jawaban siap kirim ke Telegram.

## Env yang Dibutuhkan

- `POLYFLOW_INTERNAL_BASE_URL` (default: `http://127.0.0.1:3000`)
- `POLYFLOW_OPENCLAW_API_KEY` (wajib)

## Header yang Dikirim

- `X-API-KEY: <POLYFLOW_OPENCLAW_API_KEY>`
- `x-openclaw-product: polyflow`

## Endpoint Tujuan

- `POST /api/bot/query?product=polyflow`

## Catatan Keamanan

- Bridge ini hanya untuk product `polyflow`.
- Permintaan non-polyflow akan ditolak (403).
- Guardrail read-only + topic lock tetap diproses di backend endpoint.

## Non-Breaking Guarantee

Script bridge ini tidak menyentuh jalur legacy berikut:

- `scripts/send_daily_stock.mjs`
- `scripts/telegram_cmd.mjs`
