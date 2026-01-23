# PolyFlow Localization Plan - Bahasa Indonesia

**Version**: 1.0  
**Created**: January 24, 2026  
**Status**: PENDING (After Accounting Module)  
**Phase**: 7 (Post-Accounting)

---

## 🎯 Overview

This document outlines the complete localization plan for translating PolyFlow ERP's user interface to **Bahasa Indonesia** while maintaining English source code for maintainability and industry standards.

---

## 📋 Implementation Checklist

### Phase 7A: Foundation Setup
- [ ] Install and configure `next-intl` library
- [ ] Create locale folder structure (`/messages/id.json`, `/messages/en.json`)
- [ ] Setup middleware for locale detection
- [ ] Create `useTranslations` hook wrapper
- [ ] Add language switcher component to settings

### Phase 7B: Core UI Translation
- [ ] Translate Sidebar Navigation labels
- [ ] Translate Dashboard components
- [ ] Translate common UI components (buttons, dialogs, forms)
- [ ] Translate error messages and toasts
- [ ] Translate table headers and data labels

### Phase 7C: Module-by-Module Translation
- [ ] Inventory Module
- [ ] Production Module
- [ ] Sales Module
- [ ] Purchasing Module
- [ ] Accounting Module
- [ ] Settings & User Management

### Phase 7D: Polish & Validation
- [ ] Review all translations for consistency
- [ ] Test with native speakers
- [ ] Update documentation
- [ ] Create translation contribution guide

---

## 🌐 Localization Strategy

### Hybrid Approach (Best Practice)

| Layer | Language | Rationale |
|-------|----------|-----------|
| **Source Code** | English | Industry standard, global maintainability |
| **Variable Names** | English | Technical convention |
| **Database Enums** | English | Technical identifiers, API consistency |
| **UI Labels** | **Indonesian** | End-user facing |
| **Error Messages** | **Indonesian** | End-user facing |
| **Tooltips & Help** | **Indonesian** | End-user facing |
| **Documentation** | Bilingual | Developers (EN) & Users (ID) |

---

## 📖 Terminology Dictionary (Kamus Istilah)

### Navigation & General UI

| English | Bahasa Indonesia |
|---------|------------------|
| Dashboard | Dasbor |
| Settings | Pengaturan |
| Profile | Profil |
| Logout | Keluar |
| Search | Cari |
| Filter | Filter |
| Export | Ekspor |
| Import | Impor |
| Save | Simpan |
| Cancel | Batal |
| Delete | Hapus |
| Edit | Ubah |
| Create | Buat |
| Add | Tambah |
| View | Lihat |
| Actions | Aksi |
| Status | Status |
| Date | Tanggal |
| Notes | Catatan |

### Inventory Module

| English | Bahasa Indonesia |
|---------|------------------|
| Inventory | Persediaan / Stok |
| Stock | Stok |
| Warehouse | Gudang |
| Location | Lokasi |
| Transfer | Transfer |
| Adjustment | Penyesuaian |
| Movement | Pergerakan |
| Quantity | Jumlah / Kuantitas |
| Unit | Satuan |
| Low Stock | Stok Rendah |
| Out of Stock | Stok Habis |
| Available | Tersedia |
| Reserved | Direservasi |
| Stock Opname | Stok Opname |
| Batch | Batch |
| Lot Number | Nomor Lot |
| Expiry Date | Tanggal Kedaluwarsa |

### Production Module

| English | Bahasa Indonesia |
|---------|------------------|
| Production | Produksi |
| Production Order | Perintah Produksi / SPK |
| Work Order | Perintah Kerja |
| Bill of Materials | Struktur Produk / BOM |
| BOM | BOM |
| Machine | Mesin |
| Operator | Operator |
| Shift | Shift |
| Output | Hasil Produksi |
| Scrap | Afval / Scrap |
| Yield | Yield |
| Downtime | Waktu Henti |
| Start Production | Mulai Produksi |
| Stop Production | Selesai Produksi |
| Material Issue | Pengeluaran Bahan |
| Work-in-Progress | Barang Dalam Proses |
| Finished Goods | Barang Jadi |
| Quality Inspection | Inspeksi Kualitas |

### Plastic Manufacturing Specific

| English | Bahasa Indonesia |
|---------|------------------|
| Extrusion | Ekstrusi |
| Blown Film | Blown Film |
| Mixing | Pencampuran |
| Compounding | Compounding |
| Rewinding | Rewinding |
| Slitting | Slitting |
| Resin | Resin |
| Masterbatch | Masterbatch |
| Additive | Aditif |
| Regrind | Regrind / Gilingan Ulang |
| Edge Trim | Sisi Potong |
| Core/Tube | Core / Tabung |
| Roll | Gulungan |
| Gauge/Thickness | Ketebalan |
| Width | Lebar |
| Length | Panjang |

### Sales Module

| English | Bahasa Indonesia |
|---------|------------------|
| Sales | Penjualan |
| Sales Order | Order Penjualan / SO |
| Quotation | Penawaran |
| Customer | Pelanggan |
| Invoice | Faktur |
| Delivery | Pengiriman |
| Shipment | Pengiriman |
| Payment | Pembayaran |
| Due Date | Jatuh Tempo |
| Overdue | Terlambat |
| Paid | Lunas |
| Unpaid | Belum Dibayar |
| Partial | Sebagian |
| Discount | Diskon |
| Tax | Pajak |
| Total Amount | Total |

### Purchasing Module

| English | Bahasa Indonesia |
|---------|------------------|
| Purchasing | Pembelian |
| Purchase Order | Order Pembelian / PO |
| Supplier | Pemasok |
| Vendor | Vendor |
| Goods Receipt | Penerimaan Barang |
| Purchase Invoice | Faktur Pembelian |
| Expected Date | Tanggal Diharapkan |
| Received | Diterima |
| Pending | Menunggu |

### Accounting Module

| English | Bahasa Indonesia |
|---------|------------------|
| Accounting | Akuntansi |
| Chart of Accounts | Daftar Akun / CoA |
| Account | Akun |
| Journal Entry | Jurnal |
| Debit | Debit |
| Credit | Kredit |
| Balance | Saldo |
| Trial Balance | Neraca Saldo |
| Balance Sheet | Neraca |
| Income Statement | Laporan Laba Rugi |
| Profit & Loss | Laba Rugi |
| Fiscal Period | Periode Fiskal |
| Assets | Aset |
| Liabilities | Kewajiban |
| Equity | Modal |
| Revenue | Pendapatan |
| Expense | Beban / Biaya |
| Cost of Goods Sold | Harga Pokok Penjualan / HPP |
| Accounts Receivable | Piutang Usaha |
| Accounts Payable | Utang Usaha |
| Cash | Kas |
| Bank | Bank |

### Status Labels

| English | Bahasa Indonesia |
|---------|------------------|
| Draft | Draf |
| Confirmed | Dikonfirmasi |
| In Progress | Dalam Proses |
| Completed | Selesai |
| Cancelled | Dibatalkan |
| Pending | Menunggu |
| Approved | Disetujui |
| Rejected | Ditolak |
| Active | Aktif |
| Inactive | Tidak Aktif |
| Open | Terbuka |
| Closed | Tertutup |

### Error & Validation Messages

| English | Bahasa Indonesia |
|---------|------------------|
| Required field | Wajib diisi |
| Invalid input | Input tidak valid |
| Not found | Tidak ditemukan |
| Already exists | Sudah ada |
| Insufficient stock | Stok tidak mencukupi |
| Operation failed | Operasi gagal |
| Success | Berhasil |
| Are you sure? | Apakah Anda yakin? |
| This action cannot be undone | Tindakan ini tidak dapat dibatalkan |
| Loading... | Memuat... |
| No data | Tidak ada data |
| No results | Tidak ada hasil |

---

## 🗂️ File Structure for i18n

```
src/
├── i18n/
│   ├── config.ts                 # i18n configuration
│   └── request.ts                # Server-side locale handling
├── messages/
│   ├── id.json                   # Indonesian translations
│   └── en.json                   # English translations (fallback)
├── components/
│   └── LanguageSwitcher.tsx      # Language toggle component
└── middleware.ts                 # Locale detection middleware
```

### Translation File Structure (messages/id.json)

```json
{
  "common": {
    "save": "Simpan",
    "cancel": "Batal",
    "delete": "Hapus",
    "edit": "Ubah",
    "search": "Cari",
    "loading": "Memuat...",
    "noData": "Tidak ada data"
  },
  "navigation": {
    "dashboard": "Dasbor",
    "inventory": "Persediaan",
    "production": "Produksi",
    "sales": "Penjualan",
    "purchasing": "Pembelian",
    "accounting": "Akuntansi",
    "settings": "Pengaturan"
  },
  "inventory": {
    "title": "Manajemen Persediaan",
    "stockTransfer": "Transfer Stok",
    "adjustment": "Penyesuaian Stok",
    "lowStock": "Stok Rendah",
    "movement": "Pergerakan Stok"
  },
  "production": {
    "title": "Manajemen Produksi",
    "orders": "Perintah Produksi",
    "schedule": "Jadwal Produksi",
    "machines": "Mesin",
    "startProduction": "Mulai Produksi",
    "stopProduction": "Selesai Produksi"
  },
  "validation": {
    "required": "Wajib diisi",
    "invalidInput": "Input tidak valid",
    "insufficientStock": "Stok tidak mencukupi"
  },
  "status": {
    "draft": "Draf",
    "confirmed": "Dikonfirmasi",
    "inProgress": "Dalam Proses",
    "completed": "Selesai",
    "cancelled": "Dibatalkan"
  }
}
```

---

## 📁 Files to Be Localized

### High Priority (User-Facing)

| Category | Files | Estimated Strings |
|----------|-------|-------------------|
| Sidebar Navigation | `sidebar-nav.tsx` | ~30 |
| Dashboard | `DashboardClient.tsx`, KPI cards | ~50 |
| Buttons & Forms | All form components | ~100 |
| Tables | Column headers across modules | ~150 |
| Dialogs & Modals | Confirmation dialogs | ~50 |
| Toast Messages | Success/Error messages | ~40 |

### Medium Priority

| Category | Files | Estimated Strings |
|----------|-------|-------------------|
| Inventory Module | 15+ components | ~100 |
| Production Module | 20+ components | ~120 |
| Sales Module | 15+ components | ~80 |
| Purchasing Module | 10+ components | ~60 |
| Accounting Module | 10+ components | ~80 |

### Low Priority

| Category | Files | Estimated Strings |
|----------|-------|-------------------|
| Settings pages | 5+ components | ~30 |
| Help tooltips | Various | ~50 |
| Placeholder text | Various | ~30 |

**Total Estimated Strings**: ~970 strings

---

## 🔧 Technical Setup Guide

### 1. Install next-intl

```bash
npm install next-intl
```

### 2. Create i18n Configuration

```typescript
// src/i18n/config.ts
export const locales = ['id', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'id';
```

### 3. Setup Middleware

```typescript
// middleware.ts
import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './src/i18n/config';

export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed' // No /id prefix for default
});

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)']
};
```

### 4. Usage in Components

```tsx
import { useTranslations } from 'next-intl';

export function SaveButton() {
  const t = useTranslations('common');
  return <Button>{t('save')}</Button>; // "Simpan"
}
```

---

## 📅 Estimated Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 7A: Foundation | 2 days | Accounting Module Complete |
| Phase 7B: Core UI | 3-4 days | Phase 7A |
| Phase 7C: Modules | 5-6 days | Phase 7B |
| Phase 7D: Polish | 2 days | Phase 7C |
| **Total** | **12-14 days** | |

---

## 📝 Translation Guidelines

### Do's ✅
- Use formal Indonesian ("Anda" not "kamu")
- Keep technical terms that are commonly used (BOM, SKU, PO, SO)
- Be consistent with terminology across all modules
- Keep translations concise for UI elements

### Don'ts ❌
- Don't translate brand names (PolyFlow)
- Don't translate code identifiers (enum values)
- Don't over-translate technical terms that are industry standard
- Don't use regional dialects

### Special Cases
| Term | Decision | Rationale |
|------|----------|-----------|
| BOM | Keep as "BOM" | Industry standard |
| SKU | Keep as "SKU" | Industry standard |
| PO/SO | Keep as "PO/SO" | Common abbreviation |
| Invoice | Use "Faktur" | Legal requirement in Indonesia |
| Dashboard | Use "Dasbor" | Indonesianized but recognizable |

---

## 🔗 Related Documentation

- [Accounting Module Plan](./ACCOUNTING_MODULE_PLAN.md)
- [PolyFlow Design System](../DESIGN_SYSTEM.md)
- [Architecture Guide](../ARCHITECTURE.md)

---

**Last Updated**: January 24, 2026  
**Next Action**: Complete Accounting Module (Phase 6), then begin Phase 7A
