# Plan — Stock Ledger Date Filter Fix (Opsi A -> Opsi B)

Tanggal: 2026-05-09
Owner: Hermes (eksekusi atas approval Nugroho)

## Latar Belakang
Stock ledger tidak menampilkan transaksi hari berjalan karena parsing `startDate/endDate` dari query string (`yyyy-MM-dd`) menghasilkan waktu `00:00:00`, sementara query memakai batas inklusif `createdAt <= endDate`.

## Tujuan
1. Opsi A: Perbaikan cepat agar transaksi hari berjalan langsung muncul.
2. Opsi B: Rapikan semantik rentang tanggal agar lebih robust (`[start, endExclusive)`).
3. Tambah test regresi untuk mencegah bug terulang.

## Scope File
- `src/app/warehouse/inventory/[id]/page.tsx`
- `src/actions/inventory/inventory.ts` (jika signature perlu penyesuaian)
- `src/services/inventory/stock-ledger-service.ts`
- `src/services/inventory/__tests__/stock-ledger-service.test.ts`

## Rencana Eksekusi
### Opsi A (hotfix)
- Normalisasi tanggal di page layer:
  - `startDate` -> `startOfDay(...)`
  - `endDate` -> `endOfDay(...)`
- Service tetap pakai `gte/lte` untuk sementara.
- Verifikasi dengan test existing + satu test tambahan sederhana bila perlu.

### Opsi B (hardening)
- Ubah semantik query di service menjadi half-open interval:
  - `createdAt >= startDate`
  - `createdAt < endExclusive`
- Hitung `endExclusive` dari `endDate` (next day start) di layer page/action agar tetap kompatibel dengan input `yyyy-MM-dd`.
- Tambah/update unit test khusus skenario batas tanggal (same-day setelah jam 00:00 tetap masuk).

## Validasi
- Jalankan unit test untuk stock ledger.
- Cek typecheck/lint bila diperlukan (minimal area yang diubah).
- Commit terpisah:
  - Commit 1: Opsi A
  - Commit 2: Opsi B + tests

## Risiko
- Perubahan handling date bisa memengaruhi report lain bila share helper; mitigasi: batasi perubahan hanya flow stock ledger.
- Timezone behavior JS Date; mitigasi: konsisten pakai fungsi date-fns di server-side page/service.

## Deliverable
- Code fix di branch kerja
- 2 commit terpisah (A lalu B)
- Push ke remote untuk lanjut CI/CD deploy flow.