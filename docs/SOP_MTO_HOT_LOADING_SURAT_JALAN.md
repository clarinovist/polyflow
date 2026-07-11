# SOP MTO Hot-Loading — Surat Jalan & Stok (Melindo)

## Tujuan

Memungkinkan truk dimuat dan surat jalan dicetak **sambil produksi masih jalan / stok FG belum diinput**, tanpa memotong stok fiktif di sistem. Posting stok dan draft invoice hanya saat pengiriman di-commit.

## Ruang lingkup

- Sales Order fisik (bukan maklon jasa-only)
- Surat Jalan (Delivery Order)
- Input hasil produksi → stok FG
- Invoice draft / konfirmasi finance

## Prinsip

| Tahap | Boleh? | Stok dipotong? |
|-------|--------|----------------|
| Buat & cetak SJ (PENDING / LOADING) | Ya, meski stok sistem 0 | **Tidak** |
| Muat truk fisik | Ya | **Tidak** (sistem) |
| Tandai Dikirim (SHIPPED) | Hanya jika stok FG cukup | **Ya** |
| Invoice DRAFT | Otomatis saat SHIPPED | — |
| Invoice UNPAID (konfirmasi) | Finance | — |

> **Fisik & kertas boleh lebih dulu; stok & invoice final tetap jujur.**

## Peran

| Peran | Tanggung jawab |
|-------|----------------|
| Sales / Admin | Buat SO, buat SJ, cetak SJ |
| Produksi | Input hasil produksi segera setelah pack (kiosk/WA/app) |
| Gudang | Mulai muat, Tandai Dikirim setelah stok sistem siap |
| Finance | Konfirmasi invoice DRAFT → UNPAID |

## Alur standar

1. **SO** status `CONFIRMED` / `IN_PRODUCTION` / `READY_TO_SHIP`.
2. Admin **Buat Surat Jalan** dari detail SO (atau menu Pengiriman).  
   - Status DO: `PENDING`.  
   - Banner kuning jika stok FG belum cukup → **boleh diabaikan untuk cetak**.
3. **Cetak surat jalan** → serahkan ke sopir / gudang.
4. (Opsional) Status DO → `LOADING` saat truk mulai dimuat.
5. Produksi **input hasil** sampai stok FG di lokasi sumber cukup.
6. Gudang buka detail DO → cek banner stok **hijau** → **Tandai Dikirim**.  
   - Sistem: potong stok, `deliveredQty`, SO → `SHIPPED`, invoice **DRAFT**.
7. Finance **Konfirmasi Invoice** → `UNPAID` + jurnal posted.

## Larangan

- Jangan “Tandai Dikirim” sebelum produksi diinput (akan gagal stok kurang).
- Jangan buat SJ open kedua untuk SO yang sama (sistem menolak).
- Jangan batalkan DO yang sudah `SHIPPED` lewat status — pakai alur retur.
- Jangan input stok fiktif hanya agar tombol ship lolos.

## Shortcut “Kirim Order” di SO

Tombol **Kirim Order** di SO:

- Jika sudah ada SJ aktif (`PENDING`/`LOADING`) → commit SJ itu (potong stok).
- Jika belum ada SJ → buat SJ residual + commit sekaligus.

Untuk hot-loading Melindo, **lebih disarankan** alur Buat SJ → cetak → Tandai Dikirim di detail DO.

## Troubleshooting

| Gejala | Penyebab | Tindakan |
|--------|----------|----------|
| Tandai Dikirim gagal “stok tidak cukup” | Produksi belum diinput / lokasi salah | Input produksi; cek gudang sumber DO |
| Tidak bisa buat SJ baru | Sudah ada SJ aktif | Selesaikan/batalkan SJ yang ada |
| Invoice belum muncul | DO belum SHIPPED | Commit Tandai Dikirim dulu |
| Double dokumen | SJ manual + Kirim SO | Satu open SJ per SO; pakai commit SJ yang ada |

## Referensi teknis

- Plan: `docs/plans/2026-07-11-do-stock-decouple.md`
- Service: `src/services/sales/delivery-fulfillment-service.ts`
