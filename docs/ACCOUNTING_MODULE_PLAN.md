# PolyFlow Accounting Module - Implementation Plan

**Version**: 1.0  
**Created**: January 24, 2026  
**Status**: PENDING IMPLEMENTATION  
**Phase**: 6 (Next Major Module)

---

## 🎯 Overview

This document outlines the complete implementation plan for the **Core Accounting Module** in PolyFlow ERP. The module will enable automatic journal entries from existing transactional data (Sales, Purchasing, Inventory, Production) and provide standard financial reports.

---

## 📋 Implementation Checklist

### Phase 6A: Foundation
- [ ] Add Prisma schema changes (Account, JournalEntry, JournalLine, FiscalPeriod)
- [ ] Create database migration
- [ ] Seed default Chart of Accounts
- [ ] Create `AccountingService` with basic CRUD operations
- [ ] Create `getChartOfAccounts()` server action
- [ ] Create `createAccount()` server action
- [ ] Build Chart of Accounts management UI

### Phase 6B: Auto-Journaling
- [ ] Implement `AutoJournalService` core logic
- [ ] Hook auto-journal into Sales Invoice creation
- [ ] Hook auto-journal into Sales Payment receipt
- [ ] Hook auto-journal into Goods Receipt (Purchase)
- [ ] Hook auto-journal into Purchase Payment
- [ ] Hook auto-journal into Material Issuance
- [ ] Hook auto-journal into Production Completion
- [ ] Hook auto-journal into Sales Delivery (COGS)
- [ ] Create Journal Entry list UI
- [ ] Create Manual Journal Entry form

### Phase 6C: Reporting
- [ ] Implement Trial Balance calculation
- [ ] Implement Balance Sheet generation
- [ ] Implement Income Statement (P&L) generation
- [ ] Build Trial Balance report UI
- [ ] Build Balance Sheet report UI
- [ ] Build Income Statement report UI
- [ ] Implement Fiscal Period management
- [ ] Add export to PDF/Excel functionality

### Phase 6D: Integration & Polish
- [ ] Add accounting link in sidebar navigation
- [ ] Update Executive Dashboard with financial KPIs
- [ ] Retroactive journal migration script (for existing data)
- [ ] Comprehensive testing
- [ ] Documentation update

---

## 📊 Chart of Accounts (CoA) Structure

The CoA follows a **5-digit hierarchical numbering system** suitable for Indonesian manufacturing (PSAK compliant):

### Account Classification

| Code Range | Category | Type |
|------------|----------|------|
| 1xxxx | Assets (Aset) | Balance Sheet |
| 2xxxx | Liabilities (Kewajiban) | Balance Sheet |
| 3xxxx | Equity (Modal) | Balance Sheet |
| 4xxxx | Revenue (Pendapatan) | Income Statement |
| 5xxxx | Cost of Goods Sold (HPP) | Income Statement |
| 6xxxx | Operating Expenses | Income Statement |
| 7xxxx | Other Income | Income Statement |
| 8xxxx | Other Expenses | Income Statement |

### Default Account Structure

```
1. ASSETS (ASET)
├── 11000 Current Assets (Aset Lancar)
│   ├── 11100 Cash & Bank
│   │   ├── 11110 Kas Kecil (Petty Cash)
│   │   ├── 11120 Bank BCA - IDR
│   │   └── 11130 Bank Mandiri - IDR
│   ├── 11200 Accounts Receivable (Piutang Usaha)
│   │   ├── 11210 Piutang Dagang - Customer
│   │   └── 11290 Allowance for Doubtful Accounts
│   ├── 11300 Inventory (Persediaan)
│   │   ├── 11310 Raw Materials (Bahan Baku)
│   │   ├── 11320 Work-in-Progress (Barang Dalam Proses)
│   │   ├── 11330 Finished Goods (Barang Jadi)
│   │   ├── 11340 Packaging Materials (Bahan Kemasan)
│   │   └── 11350 Scrap & Waste (Barang Sisa)
│   └── 11400 Prepaid Expenses (Biaya Dibayar Dimuka)
│       └── 11410 Prepaid Insurance
├── 12000 Fixed Assets (Aset Tetap)
│   ├── 12100 Machinery & Equipment
│   │   ├── 12110 Extrusion Machines
│   │   ├── 12120 Mixing Equipment
│   │   └── 12190 Accumulated Depreciation - Machinery
│   ├── 12200 Buildings
│   │   └── 12290 Accumulated Depreciation - Buildings
│   └── 12300 Vehicles
│       └── 12390 Accumulated Depreciation - Vehicles

2. LIABILITIES (KEWAJIBAN)
├── 21000 Current Liabilities (Kewajiban Lancar)
│   ├── 21100 Accounts Payable (Utang Usaha)
│   │   └── 21110 Utang Dagang - Supplier
│   ├── 21200 Accrued Expenses (Biaya yang Masih Harus Dibayar)
│   ├── 21300 Taxes Payable (Utang Pajak)
│   │   ├── 21310 PPN Keluaran (VAT Output)
│   │   ├── 21320 PPN Masukan (VAT Input)
│   │   └── 21330 PPh 21 Payable
│   └── 21400 Wages Payable (Utang Gaji)
└── 22000 Long-term Liabilities (Kewajiban Jangka Panjang)
    └── 22100 Bank Loans

3. EQUITY (MODAL)
├── 31000 Owner's Capital (Modal Pemilik)
├── 32000 Retained Earnings (Laba Ditahan)
└── 33000 Current Year Profit/Loss (Laba/Rugi Tahun Berjalan)

4. REVENUE (PENDAPATAN)
├── 41000 Sales Revenue (Penjualan)
│   ├── 41100 Product Sales - Finished Goods
│   ├── 41200 Sales - Scrap / Waste
│   └── 41900 Sales Returns & Allowances

5. COST OF GOODS SOLD (HARGA POKOK PENJUALAN)
├── 51000 Direct Materials (Bahan Langsung)
│   ├── 51100 Raw Material Consumption
│   └── 51200 Packaging Material Consumption
├── 52000 Direct Labor (Tenaga Kerja Langsung)
│   ├── 52100 Operator Wages
│   └── 52200 Helper Wages
├── 53000 Manufacturing Overhead (Biaya Overhead Pabrik)
│   ├── 53100 Machine Depreciation
│   ├── 53200 Electricity - Production
│   ├── 53300 Factory Maintenance
│   └── 53400 Indirect Materials

6. OPERATING EXPENSES (BIAYA OPERASIONAL)
├── 61000 Selling Expenses (Biaya Penjualan)
│   ├── 61100 Shipping & Delivery
│   └── 61200 Sales Commission
├── 62000 General & Admin Expenses (Biaya Umum & Administrasi)
│   ├── 62100 Office Salaries
│   ├── 62200 Office Supplies
│   ├── 62300 Telecommunications
│   └── 62400 Professional Fees

7. OTHER INCOME (PENDAPATAN LAIN-LAIN)
├── 71000 Interest Income
└── 72000 Foreign Exchange Gain

8. OTHER EXPENSES (BIAYA LAIN-LAIN)
├── 81000 Interest Expense
├── 82000 Bank Charges
└── 83000 Foreign Exchange Loss
```

---

## 🗄️ Database Schema Design

### New Models (to be added to `prisma/schema.prisma`)

```prisma
// ============================================
// ACCOUNTING MODELS
// ============================================

model Account {
  id              String       @id @default(uuid())
  code            String       @unique   // e.g., "11310"
  name            String                 // e.g., "Raw Materials"
  description     String?
  type            AccountType            // ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  category        AccountCategory        // CURRENT_ASSET, FIXED_ASSET, COGS, etc.
  parentId        String?
  isActive        Boolean      @default(true)
  isCashAccount   Boolean      @default(false) // For cash-flow tracking
  currency        String       @default("IDR")
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  parent          Account?     @relation("AccountHierarchy", fields: [parentId], references: [id])
  children        Account[]    @relation("AccountHierarchy")
  journalLines    JournalLine[]
  
  @@index([code])
  @@index([parentId])
}

model JournalEntry {
  id              String       @id @default(uuid())
  entryNumber     String       @unique   // JE-2026-0001
  entryDate       DateTime
  description     String
  reference       String?                // e.g., "INV-2026-0001", "GR-2026-0001"
  referenceType   ReferenceType?         // SALES_INVOICE, PURCHASE_INVOICE, etc.
  referenceId     String?                // UUID of source document
  status          JournalStatus @default(DRAFT)
  isAutoGenerated Boolean      @default(false)
  createdById     String?
  approvedById    String?
  approvedAt      DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  createdBy       User?        @relation("JournalCreator", fields: [createdById], references: [id])
  approvedBy      User?        @relation("JournalApprover", fields: [approvedById], references: [id])
  lines           JournalLine[]

  @@index([entryDate])
  @@index([referenceType, referenceId])
}

model JournalLine {
  id              String       @id @default(uuid())
  journalEntryId  String
  accountId       String
  description     String?
  debit           Decimal      @default(0) @db.Decimal(15, 2)
  credit          Decimal      @default(0) @db.Decimal(15, 2)
  currency        String       @default("IDR")
  exchangeRate    Decimal      @default(1) @db.Decimal(15, 6)
  createdAt       DateTime     @default(now())

  journalEntry    JournalEntry @relation(fields: [journalEntryId], references: [id], onDelete: Cascade)
  account         Account      @relation(fields: [accountId], references: [id])

  @@index([journalEntryId])
  @@index([accountId])
}

model FiscalPeriod {
  id              String       @id @default(uuid())
  name            String                 // e.g., "January 2026"
  startDate       DateTime
  endDate         DateTime
  year            Int
  month           Int
  status          PeriodStatus @default(OPEN)
  closedById      String?
  closedAt        DateTime?

  @@unique([year, month])
}

// Enums

enum AccountType {
  ASSET
  LIABILITY
  EQUITY
  REVENUE
  EXPENSE
}

enum AccountCategory {
  // Assets
  CURRENT_ASSET
  FIXED_ASSET
  OTHER_ASSET
  // Liabilities
  CURRENT_LIABILITY
  LONG_TERM_LIABILITY
  // Equity
  CAPITAL
  RETAINED_EARNINGS
  // Revenue
  OPERATING_REVENUE
  OTHER_REVENUE
  // Expenses
  COGS
  OPERATING_EXPENSE
  OTHER_EXPENSE
}

enum ReferenceType {
  SALES_INVOICE
  SALES_PAYMENT
  PURCHASE_INVOICE
  PURCHASE_PAYMENT
  GOODS_RECEIPT
  STOCK_ADJUSTMENT
  PRODUCTION_OUTPUT
  MATERIAL_ISSUE
  MANUAL_ENTRY
}

enum JournalStatus {
  DRAFT
  POSTED
  VOIDED
}

enum PeriodStatus {
  OPEN
  CLOSED
  LOCKED
}
```

---

## 🔄 Auto-Journaling Rules

The following transactions will **automatically generate journal entries**:

### 1. Sales Invoice Creation
```
Dr. Accounts Receivable (11210)     XXX
    Cr. Sales Revenue (41100)           XXX
    Cr. VAT Output (21310)              XXX
```

### 2. Sales Payment Receipt
```
Dr. Bank BCA (11120)                XXX
    Cr. Accounts Receivable (11210)     XXX
```

### 3. Goods Receipt (Inventory In)
```
Dr. Raw Materials Inventory (11310) XXX
Dr. VAT Input (21320)               XXX
    Cr. Accounts Payable (21110)        XXX
```

### 4. Purchase Payment
```
Dr. Accounts Payable (21110)        XXX
    Cr. Bank BCA (11120)                XXX
```

### 5. Material Issuance to Production
```
Dr. Work-in-Progress (11320)        XXX
    Cr. Raw Materials Inventory (11310) XXX
```

### 6. Production Completion
```
Dr. Finished Goods Inventory (11330) XXX
    Cr. Work-in-Progress (11320)         XXX
    Cr. Manufacturing Overhead (53xxx)   XXX (allocated)
```

### 7. Sales Delivery (COGS Recognition)
```
Dr. Cost of Goods Sold (51100)      XXX
    Cr. Finished Goods Inventory (11330) XXX
```

---

## 📁 File Structure (To Be Created)

```
src/
├── actions/
│   └── accounting.ts                    # Server Actions for accounting
├── services/
│   ├── accounting-service.ts            # Core accounting service
│   └── finance/
│       └── auto-journal-service.ts      # Auto-journaling logic
├── lib/
│   └── schemas/
│       └── accounting.ts                # Zod schemas for accounting
├── app/
│   └── dashboard/
│       └── accounting/
│           ├── page.tsx                 # Accounting overview
│           ├── chart-of-accounts/
│           │   └── page.tsx             # CoA management
│           ├── journal-entries/
│           │   ├── page.tsx             # Journal list
│           │   └── create/
│           │       └── page.tsx         # Manual entry form
│           └── reports/
│               ├── trial-balance/
│               │   └── page.tsx         # Trial balance report
│               ├── balance-sheet/
│               │   └── page.tsx         # Balance sheet
│               └── income-statement/
│                   └── page.tsx         # P&L report
└── components/
    └── accounting/
        ├── AccountTree.tsx              # CoA tree view
        ├── JournalEntryForm.tsx         # Journal entry form
        ├── JournalEntryTable.tsx        # Journal list table
        └── TrialBalanceTable.tsx        # Trial balance display
```

---

## 🔗 Integration Points

### Existing Files to Modify

| File | Modification |
|------|--------------|
| `prisma/schema.prisma` | Add accounting models and enums |
| `src/actions/sales.ts` | Hook auto-journal on invoice creation |
| `src/actions/purchasing.ts` | Hook auto-journal on goods receipt & payment |
| `src/actions/production.ts` | Hook auto-journal on material issue & output |
| `src/components/layout/sidebar-nav.tsx` | Add Accounting menu section |
| `src/actions/dashboard.ts` | Add financial KPIs to executive stats |

---

## ✅ Testing Checklist

### Unit Tests
- [ ] Journal entry debit/credit balance validation
- [ ] Account balance calculation
- [ ] Trial balance totals match

### Integration Tests
- [ ] Sales Invoice → Journal Entry auto-generated
- [ ] Payment Receipt → AR reduced in ledger
- [ ] Goods Receipt → Inventory account increased
- [ ] Period closing → No new entries allowed

### Manual Verification
- [ ] Create manual journal entry → Verify posting
- [ ] Generate Trial Balance → All accounts balanced
- [ ] Generate Balance Sheet → Assets = Liabilities + Equity
- [ ] Generate Income Statement → Revenue - Expenses = Net Profit

---

## 📅 Estimated Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 6A: Foundation | 3-4 days | None |
| Phase 6B: Auto-Journaling | 4-5 days | Phase 6A |
| Phase 6C: Reporting | 3-4 days | Phase 6A, 6B |
| Phase 6D: Integration | 2-3 days | All previous |
| **Total** | **12-16 days** | |

---

## 📝 Notes

- All monetary values use `Decimal(15, 2)` for precision
- Multi-currency support is designed but IDR is the default
- VAT handling follows Indonesian PPN 11% rate
- Fiscal year follows calendar year (Jan-Dec)

---

**Last Updated**: January 24, 2026  
**Next Action**: Begin Phase 6A - Add Prisma schema changes
