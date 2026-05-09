# Review Residue Avg Cost Legacy — Kiyowo

Tanggal: 2026-05-09
Scope: investigasi read-only pada tenant/database `polyflow` untuk menelusuri residue `averageCost` legacy yang membuat cost per variant terlihat tidak konsisten.

## Tujuan
1. Verifikasi variant mana yang masih membawa `averageCost` lama.
2. Telusuri apakah residue berasal dari stock adjustment / stock opname / movement lama.
3. Bedakan issue `standardCost` vs `averageCost` inventory.
4. Siapkan rekomendasi aksi tanpa code change.

## Langkah cek
1. Cek status container dan database target.
2. Tarik snapshot inventory untuk variant ORI/UNGU terkait.
3. Tarik stock movement historis untuk variant outlier.
4. Bandingkan `averageCost`, `standardCost`, qty stok, dan cost history.
5. Simpulkan root cause residue legacy dan opsi penanganan.

## Guardrail
- Read-only saja.
- Tidak mengubah data produksi / inventory / BOM.
- Fokus ke tenant aktif `polyflow` (Kiyowo).
