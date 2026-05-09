# Review Live ORI Setelah BOM Packing Diisi

Tanggal: 2026-05-09
Scope: cek ulang variant ORI di tenant `polyflow` setelah info terbaru bahwa BOM Packing sudah diisi untuk variant terkait.

## Tujuan
1. Verifikasi apakah semua variant ORI sekarang benar-benar sudah punya BOM Packing.
2. Cek apakah `standardCost` antar variant sudah ikut berubah atau belum.
3. Cek apakah `averageCost` inventory lama masih menahan harga tampil / current cost.
4. Bedakan issue setup BOM vs residue cost lama vs cost chain upstream.

## Langkah cek
1. Tarik daftar BOM packing aktif untuk MP ORI 15/21/24/28.
2. Bandingkan `standardCost`, `averageCost`, qty stok, dan cost history.
3. Cek apakah ada manual recalc / BOM_UPDATE sesudah BOM dilengkapi.
4. Simpulkan kenapa harga masih beda walau BOM packing sudah ada.

## Guardrail
- Read-only.
- Tidak mengubah data cost / inventory / BOM.
