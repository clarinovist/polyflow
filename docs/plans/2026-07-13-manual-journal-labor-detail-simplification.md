# Manual Journal — Ringkas Input Biaya Tenaga Kerja Langsung

> **Status:** Implemented
> **Date:** 2026-07-13
> **Requested by:** Pak Akhmad / Melindo finance
> **Context:** Form manual journal untuk cash opname/upah tenaga kerja langsung terlalu panjang karena satu orang = satu baris jurnal, padahal akun debitnya sama.
> **Estimasi MVP:** ~1–2 engineer-days

## 1. Ringkasan rekomendasi

Saya setuju dengan usulan Pak Akhmad: untuk kasus **biaya tenaga kerja langsung** yang semua detailnya masuk ke **1 akun biaya yang sama**, jurnal GL sebaiknya dibuat ringkas:

| Account | Debit | Credit |
|---|---:|---:|
| Tenaga Kerja Langsung | total detail | 0 |
| Kas Kecil / Kas / Bank | 0 | total detail |

Detail per orang tetap disimpan, tapi tidak perlu menjadi banyak baris `JournalLine`. Detail lebih tepat ditempatkan sebagai **rincian transaksi / lampiran / subtable** dari jurnal manual.

Target UX:

1. User pilih template/tipe transaksi: **Biaya Tenaga Kerja Langsung**.
2. User isi detail dalam tabel sederhana: `Nama pekerja` + `Nominal`.
3. User pilih akun biaya sekali: `Tenaga Kerja Langsung`.
4. User pilih akun pembayaran sekali: `Kas Kecil` / `Kas` / `Bank`.
5. Sistem otomatis membentuk jurnal 2 baris yang balanced.
6. Detail nama + nominal tetap terlihat di halaman detail/print untuk audit cash opname.

---

## 2. Problem statement

### Kondisi sekarang dari screenshot

Form manual journal berisi banyak baris seperti:

```text
Debit Tenaga Kerja Langsung — Biaya tenaga kerja langsung Triyono — 836.500
Debit Tenaga Kerja Langsung — Biaya tenaga kerja langsung Supri — 1.076.500
Debit Tenaga Kerja Langsung — Biaya tenaga kerja langsung Respati — 440.000
...
Credit Kas Kecil — Biaya upah tenaga kerja langsung 04/Jul/2026 — 25.335.500
```

Masalahnya: akun debit sama berulang puluhan kali.

### Pain points

| Masalah | Dampak |
|---|---|
| Banyak baris jurnal untuk akun yang sama | Form panjang, rawan salah input, lambat dipakai di lapangan |
| Akun harus dipilih berulang | Risiko salah pilih akun per baris |
| Detail pekerja bercampur dengan GL lines | Jurnal sulit dibaca sebagai ringkasan akuntansi |
| Koreksi nominal/nama perlu edit baris jurnal satu-satu | UX kurang nyaman untuk cash opname/upah harian |
| Ledger jadi ramai dengan detail operasional | Buku besar akun TKL penuh nama orang, bukan ringkasan transaksi |

### Prinsip akuntansi yang dipakai

- **General Ledger** sebaiknya menyimpan dampak akuntansi ringkas per akun.
- Detail operasional seperti nama pekerja, potongan, atau nominal per orang lebih cocok di **subsidiary/detail table**.
- Untuk audit, detail tetap harus bisa ditelusuri dari jurnal tersebut.

---

## 3. Scope MVP

### In scope

1. Tambah mode/template input khusus untuk **Biaya Tenaga Kerja Langsung** di form manual journal.
2. Detail table sederhana:
   - `nama` / `description`
   - `amount`
3. Mapping otomatis menjadi 2 journal lines:
   - Debit: akun biaya tenaga kerja langsung, sebesar total detail.
   - Credit: akun kas/bank pembayaran, sebesar total detail.
4. Simpan detail rincian supaya bisa dibuka ulang saat edit draft dan ditampilkan di detail/print.
5. Validasi total dan minimal 1 detail line dengan nominal > 0.
6. Tetap kompatibel dengan flow manual journal sekarang: save draft, edit draft, save & post.

### Out of scope MVP

- Payroll module penuh.
- Approval tenaga kerja.
- Import Excel/CSV detail upah.
- Potongan, lembur, kasbon, BPJS, pajak.
- Cost center per pekerja / per mesin / per work order.
- Perubahan laporan keuangan utama.

---

## 4. Product decisions

| # | Topik | Keputusan MVP |
|---|---|---|
| D1 | Nama fitur | `Detail Input` / `Rincian Tenaga Kerja Langsung` di manual journal |
| D2 | Jurnal GL | Tetap hanya 2 baris untuk kasus ini: 1 debit biaya + 1 credit kas/bank |
| D3 | Detail per orang | Disimpan sebagai metadata/detail terstruktur, bukan `JournalLine` GL terpisah |
| D4 | Akun biaya | Dipilih sekali, default disarankan `Tenaga Kerja Langsung [5-012b]` jika ada |
| D5 | Akun pembayaran | Dipilih sekali, default boleh `Kas Kecil [1-112]` jika template cash opname |
| D6 | Deskripsi baris debit | `Biaya tenaga kerja langsung 04 Jul 2026` atau dari header |
| D7 | Deskripsi baris credit | `Pembayaran biaya tenaga kerja langsung 04 Jul 2026` |
| D8 | Edit draft | Detail table harus bisa dimuat ulang dan diedit selama jurnal masih DRAFT |
| D9 | Posted journal | Tidak bisa edit, mengikuti aturan journal saat ini |
| D10 | Audit | Detail harus tampil di journal detail/print/export supaya tidak hilang konteks |
| D11 | Backward compatibility | Jurnal lama yang sudah punya banyak debit lines tidak di-migrate otomatis |
| D12 | Generic use | Desain sebaiknya reusable untuk template lain nanti, tapi MVP fokus TKL dulu |

---

## 5. Target user flow

```text
Finance → Journal Entries → Create Journal Entry
        │
        ├─ Mode normal: Manual Journal biasa seperti sekarang
        │
        └─ Mode detail: Biaya Tenaga Kerja Langsung
              │
              ├─ Header:
              │   · Date: 04 Jul 2026
              │   · Reference: BKK-16/07/26
              │   · Description: BERITA ACARA CASH OPNAME 04 JULI 2026
              │
              ├─ Mapping akun:
              │   · Debit account: Tenaga Kerja Langsung [5-012b]
              │   · Credit account: Kas Kecil [1-112]
              │
              ├─ Detail table:
              │   · Triyono — 836.500
              │   · Supri — 1.076.500
              │   · Respati — 440.000
              │   · ...
              │
              ├─ Summary preview:
              │   · Total detail: Rp 25.335.500
              │   · Generated journal: 2 lines, balanced
              │
              └─ Save as Draft / Save & Post
```

---

## 6. UI proposal

### 6.1 Add transaction mode selector

Di atas table line journal, tambahkan pilihan:

```text
Input Mode
(•) Manual journal lines
( ) Detail-based journal
```

Jika pilih `Detail-based journal`, tampilkan `Template`:

```text
Template
[Biaya Tenaga Kerja Langsung]
```

Untuk MVP, pilihan template boleh hanya satu.

### 6.2 Detail-based layout

```text
Date            Reference           Description
04 Jul 2026     BKK-16/07/26        BERITA ACARA CASH OPNAME 04 JULI 2026

Template: Biaya Tenaga Kerja Langsung

Debit Account       [Tenaga Kerja Langsung ...]
Credit Account      [Kas Kecil ...]

Rincian Tenaga Kerja
┌────┬────────────────────────────┬──────────────┬──────┐
│ No │ Nama / Keterangan           │ Nominal      │ Del  │
├────┼────────────────────────────┼──────────────┼──────┤
│ 1  │ Triyono                     │ 836.500      │ 🗑   │
│ 2  │ Supri                       │ 1.076.500    │ 🗑   │
│ .. │ ...                         │ ...          │ ...  │
└────┴────────────────────────────┴──────────────┴──────┘
[+ Add Detail]

Preview Jurnal
Debit  Tenaga Kerja Langsung    Rp 25.335.500
Credit Kas Kecil                Rp 25.335.500
Balanced
```

### 6.3 Halaman detail journal

Tambahkan section opsional bila jurnal punya detail:

```text
Rincian Tenaga Kerja Langsung
Triyono  Rp 836.500
Supri    Rp 1.076.500
...
Total    Rp 25.335.500
```

Journal lines tetap tampil ringkas 2 baris.

---

## 7. Data model options

### Option A — Simpan detail di JSON metadata JournalEntry

**Ide:** Tambah kolom JSON seperti `JournalEntry.metadata` / `details` jika belum ada.

Contoh shape:

```ts
{
  detailInputType: 'DIRECT_LABOR',
  detailInputVersion: 1,
  debitAccountId: '...',
  creditAccountId: '...',
  details: [
    { name: 'Triyono', amount: 836500 },
    { name: 'Supri', amount: 1076500 }
  ]
}
```

| Pros | Cons |
|---|---|
| Cepat untuk MVP | Kurang enak untuk query/report detail per orang |
| Tidak perlu tabel baru | Validasi detail ada di app layer |
| Cocok jika detail hanya untuk lampiran audit | Sulit join/filter nama pekerja |

### Option B — Tabel baru `JournalEntryDetail`

**Ide:** Tambah tabel child khusus detail jurnal.

Contoh model kasar:

```prisma
model JournalEntryDetail {
  id             String   @id @default(cuid())
  journalEntryId String
  type           String   // DIRECT_LABOR
  description    String
  amount         Decimal
  sortOrder      Int
  metadata       Json?

  journalEntry   JournalEntry @relation(fields: [journalEntryId], references: [id], onDelete: Cascade)
}
```

| Pros | Cons |
|---|---|
| Lebih rapi, queryable, scalable | Perlu migration |
| Bisa dipakai detail template lain | Implementasi lebih banyak |
| Cocok untuk audit/detail operational | Butuh update service include detail |

### Rekomendasi

Untuk PolyFlow/Melindo, saya rekomendasikan **Option B** kalau data detail ini penting untuk audit jangka panjang dan kemungkinan akan muncul untuk kasus lain.
Kalau mau rilis super cepat, **Option A** bisa jadi phase 0, tapi ada risiko nanti perlu migrasi JSON ke tabel.

**Rekomendasi final MVP:** Option B, tapi model dibuat generik (`JournalEntryDetail`) bukan `LaborDetail` supaya bisa dipakai template lain.

---

## 8. Current code map

Berdasarkan repo saat ini:

| Layer | File | Catatan |
|---|---|---|
| Create page | `src/app/finance/journals/create/page.tsx` | Mount `ManualJournalForm` |
| Edit page | `src/app/finance/journals/[id]/edit/page.tsx` | Draft edit sudah ada |
| Detail page | `src/app/finance/journals/[id]/page.tsx` | Perlu tampilkan detail tambahan |
| Form | `src/components/finance/accounting/manual-journal-form.tsx` | Saat ini line-based manual journal |
| Account picker | `src/components/finance/accounting/account-combobox.tsx` | Reuse untuk debit/credit account |
| Amount input | `src/components/finance/accounting/accounting-input.tsx` | Reuse untuk nominal detail |
| Schema | `src/lib/schemas/journal.ts` | Saat ini hanya `manualJournalSchema` line-based |
| Actions | `src/actions/finance/journal.ts` | `createManualJournal` + `updateManualJournal` |
| Service facade | `src/services/accounting/accounting-service.ts` | Expose create/update/post |
| Journal service | `src/services/accounting/journal-posting.ts` / `journals-service.ts` | Validasi balance + create/update |
| Templates | `src/lib/config/accounting-templates.ts` | Bisa dipakai/extend sebagai entry point template |

Catatan penting: fitur **edit draft manual journal sudah ada di repo**, jadi plan ini sebaiknya reuse flow itu, bukan membuat edit dari nol.

---

## 9. Implementation plan

### Phase 0 — Confirm UX + accounting rule

1. Confirm nama akun default Melindo:
   - debit: `Tenaga Kerja Langsung [5-012b]`
   - credit: `Kas Kecil [1-112]`
2. Confirm apakah detail nama pekerja wajib tampil di print journal.
3. Confirm apakah detail perlu searchable/reportable nanti.

Output: final keputusan Option A vs Option B. Rekomendasi: Option B.

### Phase 1 — Schema & persistence

Jika Option B:

1. Tambah model Prisma `JournalEntryDetail`.
2. Relation ke `JournalEntry` dengan cascade delete.
3. Field minimal:
   - `id`
   - `journalEntryId`
   - `type`
   - `description`
   - `amount`
   - `sortOrder`
   - `metadata Json?`
   - timestamps jika konvensi repo mendukung.
4. Buat migration.
5. Update query `getJournalById` supaya include details.

Rollback: drop tabel baru jika belum dipakai production. Jika sudah production, backup dulu dan buat migration rollback eksplisit.

### Phase 2 — Validation schema

Tambah schema baru, misalnya di `src/lib/schemas/journal.ts`:

```ts
const journalDetailLineSchema = z.object({
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
});

const directLaborJournalSchema = z.object({
  entryDate: z.date(),
  description: z.string().min(3),
  reference: z.string().optional(),
  debitAccountId: z.string().min(1),
  creditAccountId: z.string().min(1),
  details: z.array(journalDetailLineSchema).min(1),
});
```

Generated lines:

```ts
const total = details.reduce((sum, line) => sum + line.amount, 0);
lines = [
  { accountId: debitAccountId, debit: total, credit: 0, description },
  { accountId: creditAccountId, debit: 0, credit: total, description: `Pembayaran ${description}` },
];
```

### Phase 3 — Service/action layer

Tambah action khusus agar mode normal tidak makin rumit:

```ts
createDirectLaborJournal(data, post = false)
updateDirectLaborJournal(id, data, post = false)
```

Service responsibilities:

1. Validate detail total > 0.
2. Generate 2 journal lines.
3. Create/update `JournalEntry` + `JournalLine` + `JournalEntryDetail` dalam satu transaksi.
4. Reuse existing balance/period/control-account guard.
5. Untuk update: hanya allow `DRAFT` dan `!isAutoGenerated`, sama seperti `updateDraftJournal`.
6. Log audit action:
   - `CREATE_DIRECT_LABOR_JOURNAL`
   - `UPDATE_DIRECT_LABOR_JOURNAL`
   - `CREATE_AND_POST_DIRECT_LABOR_JOURNAL`

### Phase 4 — UI form

Pilihan implementasi UI:

| Opsi | Penjelasan | Rekomendasi |
|---|---|---|
| A | Extend `ManualJournalForm` dengan mode `manual` vs `detail` | Cepat, tapi file bisa makin besar |
| B | Buat component baru `DirectLaborJournalForm` lalu create page switch mode | Lebih rapi |

Rekomendasi: **Buat component baru** untuk menjaga `ManualJournalForm` tidak makin kompleks.

File baru yang mungkin:

```text
src/components/finance/accounting/direct-labor-journal-form.tsx
```

Perubahan create page:

```text
src/app/finance/journals/create/page.tsx
```

Tambah mode selector:

```text
Manual Journal | Biaya Tenaga Kerja Langsung
```

Untuk edit page:

- Jika journal punya `JournalEntryDetail.type === DIRECT_LABOR`, render `DirectLaborJournalForm`.
- Jika tidak, render `ManualJournalForm` seperti sekarang.

### Phase 5 — Detail/print view

Update:

```text
src/app/finance/journals/[id]/page.tsx
```

Tambahkan section detail bila ada:

- Header: `Rincian Tenaga Kerja Langsung`
- Table: no, nama/keterangan, nominal
- Total detail
- Validasi tampilan: total detail sama dengan debit line generated.

Jika ada print component/route journal, update juga supaya detail ikut tercetak. Jika belum ada print dedicated, minimal tampil di detail page dahulu.

### Phase 6 — Tests & verification

Minimal verification:

1. `npm run lint`
2. Test service/action terkait jika tersedia.
3. Manual QA di browser:
   - Create direct labor draft.
   - Detail page menampilkan 2 journal lines + detail list.
   - Edit draft direct labor.
   - Save & post.
   - Posted journal tidak bisa diedit.
   - Normal manual journal tetap jalan.

Jika ada test coverage accounting:

- Unit test generate journal lines dari detail.
- Service test create/update detail atomic.
- Guard test unbalanced/zero detail/reject non-draft update.

---

## 10. Acceptance criteria

### Functional

- [ ] User bisa input rincian tenaga kerja dalam satu tabel `Nama/Keterangan + Nominal`.
- [ ] User tidak perlu memilih akun TKL berulang di tiap pekerja.
- [ ] Sistem menghasilkan jurnal GL hanya 2 baris untuk kasus direct labor.
- [ ] Total debit = total credit otomatis.
- [ ] Detail nama pekerja tersimpan dan tampil di journal detail.
- [ ] Draft direct labor journal bisa diedit.
- [ ] Posted direct labor journal tidak bisa diedit.
- [ ] Manual journal mode lama tetap berfungsi.

### Accounting/data safety

- [ ] Tidak ada perubahan otomatis ke jurnal lama.
- [ ] Create/update detail + journal lines berjalan dalam transaksi atomik.
- [ ] Period close guard tetap berlaku.
- [ ] Control account guard tetap berlaku.
- [ ] Posting tetap memakai flow `postJournal` existing.

### UX

- [ ] Form direct labor lebih pendek dari model lama.
- [ ] Ada preview generated journal sebelum save/post.
- [ ] Error validasi jelas: detail kosong, nominal nol, akun belum dipilih.
- [ ] Default akun membantu user tapi masih bisa diganti bila perlu.

---

## 11. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Detail tersimpan tapi tidak ikut print | Acceptance criteria wajib detail tampil di detail/print |
| User perlu laporan per orang | Pilih Option B table, bukan JSON metadata |
| Jurnal lama sudah banyak lines | Jangan migrate otomatis; biarkan history apa adanya |
| Form create jadi terlalu kompleks | Pisahkan `DirectLaborJournalForm` dari `ManualJournalForm` |
| Salah akun default | Default by account code hanya sebagai helper; user tetap bisa pilih |
| Service create/update double logic | Extract helper `buildDirectLaborJournalLines(data)` |

---

## 12. Suggested response ke Pak Akhmad

> Setuju Pak, untuk biaya tenaga kerja langsung yang akunnya sama, input bisa kita sederhanakan. Nanti user cukup isi rincian nama dan nominal dalam satu tabel, lalu pilih akun biaya TKL dan akun kas/kecil sekali saja. Sistem otomatis menjurnal totalnya menjadi 2 baris: debit Biaya Tenaga Kerja Langsung dan credit Kas Kecil. Detail nama orang tetap disimpan dan tampil untuk audit/cash opname, tapi buku besar menjadi lebih ringkas.

---

## 13. Open questions

1. Apakah default lawan akun selalu `Kas Kecil [1-112]`, atau kadang `Kas/Bank` lain?
2. Apakah detail perlu dicetak dalam format BKK / berita acara khusus?
3. Apakah detail perlu export Excel?
4. Apakah template ini hanya untuk `Tenaga Kerja Langsung`, atau nanti juga untuk biaya lain yang punya rincian banyak tapi akun sama?
