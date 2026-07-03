# OpenClaw Router Snippet (Legacy + Virtual CS)

Tujuan: memisahkan jalur command legacy Telegram dan jalur Virtual CS Polyflow secara tegas.

## File Referensi

- `scripts/openclaw_router_polyflow_example.mjs`

## Routing Rule

1. Jika pesan cocok command legacy berikut, jalankan script lama apa adanya:
- `/stok`
- `/stok_kritis`
- `/produksi_aktif`
- `/pending_sales`
- `/mutasi_hari_ini`
- `/finance_summary`

2. Jika bukan command legacy, arahkan ke bridge Virtual CS:
- `node scripts/openclaw_polyflow_bridge.mjs "<question>" "<requesterName?>"`

## Kenapa Penting

- Menjaga automasi lama tetap stabil.
- Menambah fitur CS tanpa override flow yang sudah berjalan.
- Memastikan isolasi konteks hanya untuk Polyflow pada jalur CS baru.

## Catatan

Snippet ini adalah contoh integrasi. Implementasi final tetap mengikuti mekanisme handler event Telegram di instance OpenClaw Anda.
