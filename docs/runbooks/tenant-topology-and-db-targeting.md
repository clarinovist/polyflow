# PolyFlow Tenant Topology and DB Targeting

Updated: 2026-05-09
Owner: Engineering / Operations

## Purpose

Dokumen ini menjadi referensi resmi untuk mapping tenant PolyFlow ke database target.

Tujuan utamanya:
- menghilangkan ambiguity antara nama tenant, subdomain, dan nama database
- mencegah human error saat investigasi, query, import, seed, atau perbaikan data
- menetapkan workflow operasional yang tenant-first, bukan database-name-first

## Current Production Topology

### Tenant 1 — Kiyowo
- Tenant slug: `kiyowo`
- Tenant name: `PT Kiyowo Plastik Indonesia`
- Subdomain: `kiyowo.polyflow.uk`
- Database: `polyflow`
- Status: active

### Tenant 2 — Melindo
- Tenant slug: `melindo`
- Tenant name: `Melindo Rafia`
- Subdomain: `melindo.polyflow.uk`
- Database: `melindo_rafia`
- Status: active

## Critical Naming Warning

`polyflow` saat ini adalah nama database tenant untuk Kiyowo.

Artinya:
- nama `polyflow` JANGAN diasumsikan sebagai label database global/sistem
- ketika seseorang berkata “DB polyflow”, itu ambigu dan berbahaya
- dalam operasional harian, selalu sebut tenant dulu: `kiyowo` atau `melindo`

## Canonical Language Rule

Gunakan istilah berikut:
- benar: “masuk ke tenant Kiyowo”
- benar: “jalankan query ke tenant Melindo”
- salah/ambigu: “masuk ke DB polyflow”

Aturan percakapan dan dokumentasi:
1. tenant slug = identitas utama
2. nama database = hasil resolusi, bukan input manusia utama
3. semua runbook dan plan wajib menyebut tenant terlebih dahulu

## Verified Mapping Source

Mapping tenant diambil dari main database production table `Tenant`:
- column `subdomain`
- column `name`
- column `dbUrl`

Catatan penting:
- nama kolom live adalah `dbUrl`, bukan `databaseUrl`
- jangan menebak schema; verifikasi dulu saat membuat query/tooling

## Operational Consequences

Karena topologi saat ini asimetris:
- `kiyowo` -> `polyflow`
- `melindo` -> `melindo_rafia`

maka semua tooling wajib:
1. menerima tenant slug sebagai input
2. men-resolve db target secara eksplisit
3. menampilkan tenant + db target sebelum query atau write dijalankan

## Approved Guardrail Direction (Option A)

Untuk fase sekarang, strategi yang dipilih adalah:
- tidak memigrasikan Kiyowo ke DB baru dulu
- tidak mengubah topologi tenant production
- memperkuat guardrail operasional tenant-first

Implementasi guardrail dilakukan lewat:
- runbook topology ini
- SOP tenant-first workflow
- helper script resolver `tenant -> db`
- wrapper `psql` read/write yang menampilkan target secara eksplisit

## Do / Don’t

### Do
- gunakan `kiyowo` atau `melindo` sebagai input awal
- cek hasil resolusi tenant sebelum menjalankan SQL
- untuk write operation: backup dulu dan pastikan target tenant benar
- untuk script Prisma/Node: gunakan `DATABASE_URL` explicit

### Don’t
- jangan hardcode `polyflow` sebagai asumsi “main business DB” tanpa konteks
- jangan jalankan seed generik tanpa target tenant yang eksplisit
- jangan pakai nama DB mentah sebagai bahasa operasional harian

## Fast Reference Table

| Tenant slug | Tenant name | Subdomain | DB name | Note |
|---|---|---|---|---|
| `kiyowo` | PT Kiyowo Plastik Indonesia | `kiyowo.polyflow.uk` | `polyflow` | historical naming trap |
| `melindo` | Melindo Rafia | `melindo.polyflow.uk` | `melindo_rafia` | explicit tenant DB |

## Related Runbooks
- `docs/runbooks/tenant-first-database-workflow.md`
- `docs/plans/2026-05-09-tenant-first-guardrails.md`
