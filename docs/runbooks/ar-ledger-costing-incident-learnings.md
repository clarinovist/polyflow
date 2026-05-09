# PolyFlow Incident Learnings — Stock Ledger, Costing Explainability, AR Subledger vs GL

Updated: 2026-05-09
Owner: Finance + Warehouse + Engineering

## 1) Stock Ledger Date Filter Boundary (Critical)

Problem pattern:
- Filter tanggal dari URL `yyyy-mm-dd` diparse jadi jam `00:00:00`
- Query pakai `createdAt <= endDate`
- Transaksi di hari yang sama (setelah jam 00:00) tidak muncul

Rule wajib:
- Gunakan rentang half-open: `[startDate, endExclusive)`
- Implementasi aman:
  - `createdAt >= startOfDay(startDate)`
  - `createdAt < addDays(startOfDay(endDate), 1)`

Engineering policy:
- Wajib regression test untuk preset “Hari Ini” dan single-date filter.
- Fix rollout disarankan 2 tahap:
  1. Opsi A (UI/page normalization)
  2. Opsi B (service query end-exclusive + test)

## 2) Costing Explainability (Standard Cost vs Buy Price)

Fakta penting:
- `buyPrice` bukan sumber utama jika SKU punya chain costing dari BOM / weighted source.
- `standardCost` bisa naik jauh dari `buyPrice` jika:
  - ingredient cost sudah tinggi
  - scrap bertingkat antar level BOM

Chain fallback yang dipakai engine:
- `inventory.averageCost` -> `standardCost` -> `buyPrice` -> `price` -> `0`

Checklist trace cost per SKU:
1. Ambil `ProductVariant.standardCost`, `buyPrice`
2. Cek `CostHistory` terakhir (`changeReason`, `referenceId`)
3. Jika `BOM_UPDATE`:
   - ambil BOM default output
   - breakdown semua ingredient + scrap
   - resolve unit cost ingredient dengan chain fallback
4. Hitung ulang formula output dan cocokkan dengan `newCost`

## 3) AR Correction — Subledger vs GL (Jangan Disamakan)

Konsep:
- Update `Invoice/SalesOrder` = update subledger dokumen
- Tidak selalu otomatis sinkron ke GL control account (11210)
- Jika ada mismatch historis, perlu jurnal adjustment terpisah

Kasus referensi (Fadila):
- Invoice OB-INV-0007 dikoreksi dari 156.328.180 ke 219.870.280
- Payment existing tetap 7.192.000
- Outstanding berubah sesuai `totalAmount - paidAmount`
- Lalu perlu sinkron GL dengan jurnal penyesuaian delta 63.542.100

## 4) SOP Koreksi Nominal Piutang Opening Balance

Pre-flight (wajib):
1. Backup database
2. Verifikasi chain Customer -> SalesOrder -> Invoice
3. Verifikasi payment existing pada invoice
4. Hitung delta target vs nominal lama

Step A — Koreksi dokumen subledger:
- Update `Invoice.totalAmount`
- Recompute status berdasarkan `paidAmount`
- Update `SalesOrder.totalAmount` pasangan opening

Step B — Sinkron GL (jika diminta):
- Post JE adjustment untuk delta
- Contoh practical pattern yang dipakai:
  - Dr 11210 Trade Receivables
  - Cr 31110 Modal Disetor
- Catatan: akun lawan bisa 30000 OBE sesuai kebijakan periode/fresh-start

Step C — Verifikasi akhir:
1. Invoice total/paid/outstanding benar
2. Payment tetap utuh (tidak hilang)
3. JE adjustment posted dan balanced
4. Saldo akun terkait berubah sesuai delta

## 5) Query Verifikasi Cepat (Read-only)

A. Cek invoice + SO + outstanding customer
```sql
SELECT c.name, so."orderNumber", so."totalAmount" AS so_total,
       i."invoiceNumber", i."totalAmount" AS inv_total,
       i."paidAmount", (i."totalAmount"-i."paidAmount") AS outstanding, i.status
FROM "Customer" c
JOIN "SalesOrder" so ON so."customerId"=c.id
JOIN "Invoice" i ON i."salesOrderId"=so.id
WHERE c.name ILIKE '%fadila%';
```

B. Cek payment untuk invoice
```sql
SELECT p."paymentNumber", p."paymentDate", p.amount, p.method, p."invoiceId"
FROM "Payment" p
WHERE p."invoiceId" = '<invoice_id>'
ORDER BY p."paymentDate";
```

C. Cek JE by reference
```sql
SELECT id, "entryNumber", "entryDate", reference, "referenceType", status, description
FROM "JournalEntry"
WHERE reference = '<reference>'
ORDER BY "entryDate";
```

D. Cek line akun JE
```sql
SELECT a.code, a.name, jl.debit, jl.credit
FROM "JournalLine" jl
JOIN "Account" a ON a.id=jl."accountId"
WHERE jl."journalEntryId" = '<je_id>'
ORDER BY a.code;
```

## 6) Guardrail Produk (Recommended backlog)

P0:
- Endpoint atomic “Adjust Opening AR”:
  - update invoice + SO + optional JE sync dalam 1 transaksi terkontrol

P1:
- UI warning saat edit invoice yang sudah punya payment
- Toggle dampak: “Subledger only” vs “Subledger + GL sync”

P1:
- Rekonsiliasi otomatis harian:
  - AR subledger outstanding vs GL 11210
  - tampilkan selisih per customer/invoice

P2:
- Cost lineage panel per SKU (source, formula, component, scrap, reference)

## 7) Operational Rules

- Untuk perubahan finansial di production: backup dulu, transaction, verifikasi after-write.
- Jangan mengasumsikan auto-sync ke akun lain jika hanya update dokumen invoice.
- Semua koreksi nominal signifikan harus punya reference JE + catatan audit.