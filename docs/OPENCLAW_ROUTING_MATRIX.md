# OpenClaw Routing Matrix (Localized for Polyflow)

Dokumen ini memastikan OpenClaw yang dipakai multi-aplikasi tetap terisolasi ketat, dan endpoint di workspace ini hanya melayani Polyflow.

## Product Resolver

OpenClaw wajib menetapkan `product_id` sebelum memanggil brain endpoint.

Aturan resolver yang disarankan:

1. Telegram Bot Token atau Chat ID mapping ke product.
2. Web Widget domain/subdomain mapping ke product.
3. Manual override dari operator dilarang kecuali role admin platform.

## Matrix Kanal ke Endpoint

| Channel | Resolver Input | Product Valid | Endpoint | Auth Layer | Policy Layer |
|---|---|---|---|---|---|
| Telegram OpenClaw | bot profile / routing key | polyflow | `POST /api/bot/query?product=polyflow` | X-API-KEY | read-only + topic-lock |
| Web Chat Widget Polyflow | app session + tenant host | polyflow | `POST /api/chat` | NextAuth session | read-only + topic-lock |
| Non-Polyflow traffic | any | selain polyflow | ditolak (`403`) | n/a | scope mismatch |

## Mandatory Request Contract (External)

Header:

- `X-API-KEY: <polyflow-specific-key>`
- `x-openclaw-product: polyflow`

Body:

```json
{
  "question": "stok kritis hari ini bagaimana?",
  "requesterName": "Budi"
}
```

## Rejection Rules

Permintaan wajib ditolak jika:

1. `product` bukan `polyflow`.
2. Pertanyaan meminta mutasi data (create/update/delete).
3. Pertanyaan meminta eksekusi bash/script/terminal.
4. Topik di luar operasional Polyflow atau SOP penggunaan.

## Metrics Endpoint (Internal Observability)

Untuk memonitor kualitas guardrails dan penggunaan per channel:

- `GET /api/admin/diagnostics/virtual-cs-metrics`

Response menampilkan ringkasan in-memory sejak service start:

- total allowed
- total blocked
- total failed
- breakdown per channel (`telegram`, `web`)

Endpoint ini hanya bisa diakses role `ADMIN`.

## Non-Breaking Rule

Integrasi ini tidak mengubah jalur script legacy Telegram di:

- `scripts/send_daily_stock.mjs`
- `scripts/telegram_cmd.mjs`

Scheduled task lama tetap berjalan seperti sebelumnya.
