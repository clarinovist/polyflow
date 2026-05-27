# PolyFlow Localization Final Audit

**Tanggal:** 2026-05-27  
**Scope:** UI copy localization dari English hardcoded menuju hybrid Bahasa Indonesia/English sesuai `LANGUAGE_GUIDELINES.md`.

---

## 1. Executive Summary

Localization phase untuk PolyFlow sudah selesai untuk area user-facing utama.

Arah bahasa yang dipakai:

> Bahasa Indonesia untuk instruksi, navigasi, empty state, toast, dan dialog; istilah industri yang lazim tetap hybrid seperti Invoice, Supplier, PO, SO, BOM, WIP, Scrap, Costing, Finance, dan Maklon.

Hasil utama:

- Label mapping terpusat sudah dibuat di `src/lib/labels/`.
- Navigasi, sidebar, kiosk, warehouse, production, sales, purchasing, finance, admin/settings, toast, empty state, confirmation dialog, dan visible copy utama sudah dilokalkan.
- Enum/database tetap English; hanya display/UI yang berubah.
- Full verification terakhir lulus: `npx tsc --noEmit --pretty false` dan `npm run lint`.

---

## 2. Commit Coverage

Total commit localization yang terdeteksi dari `git log --grep=lang`: **29 commit**.

Fase besar yang selesai:

| Fase | Scope | Status |
|---|---|---|
| PR #1 | Label foundation `src/lib/labels/` | ✅ Selesai |
| PR #2 | Main navigation + sidebars | ✅ Selesai |
| PR #3 | Operator Kiosk | ✅ Selesai |
| PR #4A | Warehouse pages | ✅ Selesai |
| PR #4B | Production pages | ✅ Selesai |
| PR #5 | Status display + domain-aware `getStatusLabel` | ✅ Selesai |
| PR #6A | Sales UI labels | ✅ Selesai |
| PR #6B | Purchasing UI labels + purchasing status domain | ✅ Selesai |
| PR #7A | Success toast localization | ✅ Selesai |
| PR #7B | Error toast localization | ✅ Selesai |
| PR #7C | Empty state localization | ✅ Selesai |
| PR #7D | Confirmation/destructive dialog localization | ✅ Selesai |
| PR #8 | Final visible English sweep | ✅ Selesai |

---

## 3. Label Mapping Status

Centralized label files:

- `src/lib/labels/common.ts`
- `src/lib/labels/navigation.ts`
- `src/lib/labels/status.ts`
- `src/lib/labels/helpers.ts`
- `src/lib/labels/production.ts`
- `src/lib/labels/warehouse.ts`
- `src/lib/labels/kiosk.ts`
- `src/lib/labels/sales.ts`
- `src/lib/labels/purchasing.ts`
- `src/lib/labels/finance.ts`

Important design decision:

- `getStatusLabel(status, domain)` memakai domain eksplisit: `production`, `warehouse`, `sales`, `finance`, `purchasing`.
- Tanpa domain, fallback ke common status.
- Tidak ada dependency runtime ke Prisma di label mapping, sehingga aman untuk client component.

---

## 4. Verification Result

Command terakhir yang dijalankan:

```bash
npx tsc --noEmit --pretty false
npm run lint
```

Hasil:

- TypeScript: ✅ clean
- ESLint: ✅ clean
- Working tree setelah commit final: ✅ clean

---

## 5. Final Grep Result

### 5.1 Toast English candidates

Final toast grep hanya menyisakan satu false positive:

```txt
src/components/warehouse/inventory/ImportStockDialog.tsx
toast.success(`Berhasil mengimpor ${result.data.imported} item`)
```

Keterangan:

- Copy sudah Bahasa Indonesia.
- Kata `imported` adalah nama property data (`result.data.imported`), bukan teks UI.
- Tidak perlu diubah.

### 5.2 Visible English candidates

Sisa grep yang masih muncul setelah final sweep masuk kategori berikut:

| Kategori | Contoh | Keputusan |
|---|---|---|
| Console/server logs | `console.error("Failed to load...")` | Dibiarkan; bukan UI user-facing. |
| Server/action errors | `throw new BusinessRuleError(...)` | Dibiarkan untuk audit berikutnya karena lebih berisiko dan bisa memengaruhi debugging. |
| Comments/internal code | `// Back to before-release state` | Dibiarkan; bukan UI. |
| Hybrid industry terms | BOM, Invoice, Supplier, PO, SO, Costing, WIP, Scrap, Maklon | Dibiarkan sesuai guideline. |

---

## 6. Known Remaining Non-UI / Server-Side English

Sisa English yang sengaja tidak disapu di fase ini terutama berada di:

- `src/actions/**`
- `src/services/**`
- `src/app/api/**`
- `console.error(...)`
- komentar teknis
- error internal yang perlu audit terpisah

Alasan tidak disentuh:

1. Bisa menjadi bagian dari debugging/logging.
2. Bisa dipakai oleh caller/server action sebagai structured fallback.
3. Perlu review domain/business rule satu per satu agar tidak mengaburkan akar masalah.

Jika ingin dilanjutkan, buat fase terpisah:

> **Server Action Error Localization Audit**

Scope-nya harus lebih konservatif daripada UI copy.

---

## 7. Maintenance Rules ke Depan

Untuk menjaga konsistensi bahasa:

1. Label domain baru harus masuk ke `src/lib/labels/*`, bukan hardcoded di banyak file.
2. Status display wajib memakai `getStatusLabel(status, domain)`.
3. Toast baru harus pakai pola Bahasa Indonesia:
   - Success: `[Objek] berhasil [aksi].`
   - Error fallback: `Gagal [aksi]. Silakan coba lagi.`
4. Error yang berasal dari server (`result.error`, `error.message`) boleh tetap dipertahankan agar detail debugging tidak hilang.
5. Dialog destruktif harus menjelaskan dampak aksi, bukan hanya “Yakin?”.
6. Empty state harus memberi konteks dan next action jika relevan.

---

## 8. Recommended Follow-Up

### Short term

- Manual QA di browser untuk halaman prioritas:
  - Login
  - Kiosk
  - Warehouse Inventory/Opname/Import
  - Production Order detail
  - Sales Order/Invoice/Return
  - Purchase Order/Goods Receipt/Purchase Invoice
  - Finance Journals/COA/Payments

### Medium term

- Tambahkan lint/helper rule ringan untuk mencegah copy baru terlalu banyak hardcoded English.
- Buat review checklist: “Apakah copy UI sudah ikut glossary?”
- Pertimbangkan `labels` mapping tambahan untuk import wizard dan finance payment copy jika area itu berkembang.

### Optional future phase

- Server/action error localization audit.
- Full i18n hanya jika PolyFlow menargetkan user bilingual/multinational. Untuk market Indonesia saat ini, label mapping hybrid sudah cukup.

---

## 9. Final Decision

Localization UI phase dianggap **selesai**.

Kondisi sekarang sudah sesuai target:

> PolyFlow memakai Bahasa Indonesia operasional sebagai default, mempertahankan istilah industri yang lazim, dan tetap menjaga enum/database/logic dalam English internal representation.
