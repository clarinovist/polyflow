# PolyFlow Tenant-First Guardrails Plan

> Mode saat ini: rencana saja. Belum ada perubahan ke VPS, database, aplikasi, atau script produksi.

## Goal
Menurunkan risiko human error pada environment PolyFlow yang sekarang memiliki 2 tenant aktif dengan naming database yang asimetris:
- `kiyowo` -> DB `polyflow`
- `melindo` -> DB `melindo_rafia`

## Problem Summary
Masalah utama bukan jumlah tenant, tetapi ambiguity operasional:
- nama DB `polyflow` terdengar seperti database sistem/global, padahal saat ini dipakai sebagai tenant DB Kiyowo
- operator mudah salah target saat menjalankan query, seed, import, atau cleanup
- script yang default ke `polyflow` berisiko menghantam tenant Kiyowo tanpa sadar

## Decision
Ambil Opsi A dulu:
- tidak memigrasikan data Kiyowo sekarang
- tidak mengubah topology tenant saat ini
- fokus pada guardrail operasional berbasis nama tenant, bukan nama database mentah

## Target Outcome
Semua workflow harian menjadi tenant-first:
- operator memilih `kiyowo` atau `melindo`
- tooling men-resolve nama tenant ke database URL yang benar
- perintah read/write selalu menampilkan target tenant + DB sebelum eksekusi
- tindakan destruktif tidak boleh berjalan tanpa explicit confirmation terhadap tenant target

---

## Scope Opsi A

### In scope
1. Dokumentasi topology tenant resmi
2. Naming convention operasional berbasis tenant slug
3. Helper script resolver `tenant -> db`
4. Preflight output untuk command database
5. Larangan penggunaan nama DB mentah dalam workflow manual harian
6. Checklist safety untuk operasi read-only vs write

### Out of scope
1. Migrasi DB Kiyowo ke database baru `kiyowo`
2. Refactor arsitektur multi-tenant aplikasi
3. Perubahan schema database
4. Perubahan CI/CD image

---

## Proposed Deliverables

### 1) Topology document
Buat dokumen permanen yang menjelaskan mapping resmi:

- Tenant `kiyowo`
  - subdomain: `kiyowo.polyflow.uk`
  - database: `polyflow`
  - note: historical naming, jangan diasumsikan sebagai DB sistem/global

- Tenant `melindo`
  - subdomain: `melindo.polyflow.uk`
  - database: `melindo_rafia`

Dokumen ini sebaiknya disimpan di:
- `docs/runbooks/tenant-topology-and-db-targeting.md`

### 2) Tenant resolver script
Buat script kecil yang menerima tenant slug dan mengembalikan metadata:
- tenant slug
- display name
- subdomain
- db name
- db URL

Contoh penggunaan:
- `./scripts/tenant-db.sh kiyowo`
- `./scripts/tenant-db.sh melindo`

Output contoh:
```text
TENANT=kiyowo
NAME=PT Kiyowo Plastik Indonesia
SUBDOMAIN=kiyowo
DB_NAME=polyflow
DB_URL=postgresql://polyflow:polyflow@polyflow-db:5432/polyflow
```

### 3) Safe DB wrapper commands
Buat wrapper read-only dan write-intent yang tenant-first.

Contoh read-only:
- `./scripts/tenant-psql-read.sh kiyowo`
- `./scripts/tenant-psql-read.sh melindo`

Contoh write-intent:
- `./scripts/tenant-psql-write.sh melindo`

Perilaku minimal wrapper:
1. resolve tenant
2. print target jelas ke terminal
3. untuk mode write: tampilkan warning besar + butuh konfirmasi manual
4. baru lanjut ke `docker exec -i polyflow-db psql ...`

### 4) Team rule / operator rule
Tetapkan rule sederhana:
- jangan bilang "masuk ke DB polyflow"
- selalu bilang "masuk ke tenant Kiyowo" atau "masuk ke tenant Melindo"
- di level command, tenant slug jadi input utama; DB name hanya hasil resolusi internal

### 5) Dangerous-operation checklist
Tambahkan checklist singkat sebelum operasi write:
- tenant target = ?
- db hasil resolusi = ?
- read-only atau write?
- ada backup atau tidak?
- apakah command ini pakai script custom atau raw SQL?
- kalau script Node/Prisma: apakah `DATABASE_URL` explicit?

---

## Implementation Track (after approval)

### Phase 1 — Documentation only
1. Tulis runbook topology tenant
2. Tulis SOP singkat tenant-first workflow
3. Simpan contoh command aman vs command yang dilarang

### Phase 2 — Tooling guardrail
1. Buat `scripts/tenant-db.sh`
2. Buat `scripts/tenant-psql-read.sh`
3. Buat `scripts/tenant-psql-write.sh`
4. Uji hanya pada mode read-only dulu

### Phase 3 — Adoption
1. Semua investigasi mulai dari tenant slug
2. Semua plan/runbook menyebut tenant dulu, DB kedua
3. Semua tindakan write wajib lewat wrapper atau explicit preflight

---

## Draft Command Patterns

### Read-only pattern
```bash
ssh nugrohopramono "docker exec -i polyflow-db psql -U polyflow -d polyflow -At -c \"SELECT id, name, subdomain, \\\"dbUrl\\\" FROM \\\"Tenant\\\" ORDER BY subdomain;\""
```

### Tenant resolution pattern
Resolver membaca table `Tenant` di main DB lalu menurunkan target DB dari kolom `dbUrl`.

### Write safety pattern
Untuk operasi write di tenant:
1. resolve tenant dulu
2. tampilkan hasil resolusi
3. kalau target salah, stop sebelum SQL/script jalan
4. jika script Prisma/Node, inject `DATABASE_URL` explicit dan jangan pernah pakai default container

---

## Risks and Mitigations

| Risiko | Mitigasi |
|---|---|
| Operator tetap menyebut nama DB mentah | Terapkan tenant-first terminology di plan, runbook, dan command |
| Script lama masih hardcoded `polyflow` | Audit bertahap script penting dan bungkus dengan preflight resolver |
| False sense of safety | Wrapper harus print tenant + db + intent, bukan sekadar alias |
| Future tenant bertambah | Resolver ambil dari table `Tenant`, tidak hardcoded 2 tenant saja |

---

## Success Criteria

Opsi A dianggap berhasil jika:
1. semua orang bisa jawab dengan jelas bahwa `polyflow` saat ini = DB tenant Kiyowo, bukan label global
2. investigasi harian dilakukan dengan tenant slug sebagai input utama
3. tidak ada command write yang berjalan tanpa target tenant yang eksplisit
4. runbook topology tersedia di repo dan mudah dirujuk

---

## Recommendation
Lanjutkan Opsi A dalam dua langkah kecil:
1. dokumentasi topology + SOP tenant-first dulu
2. setelah review, baru tambah wrapper script guardrail

Ini memberi penurunan risiko tercepat tanpa menyentuh data tenant sama sekali.
