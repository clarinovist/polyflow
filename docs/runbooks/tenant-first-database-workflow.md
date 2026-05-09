# PolyFlow Tenant-First Database Workflow

Updated: 2026-05-09
Owner: Engineering / Operations

## Objective

Menetapkan SOP sederhana agar semua operasi database PolyFlow dimulai dari tenant, bukan dari nama database mentah.

## Core Principle

Input manusia utama = tenant slug.

Bukan:
- `polyflow`
- `melindo_rafia`

Melainkan:
- `kiyowo`
- `melindo`

## Standard Workflow

### Step 1 — Tentukan tenant dulu
Sebelum menjalankan apa pun, jawab dulu:
- tenant target siapa?
- `kiyowo` atau `melindo`?

### Step 2 — Resolve tenant ke database target
Gunakan resolver:
```bash
./scripts/tenant-db.sh kiyowo
./scripts/tenant-db.sh melindo
```

Output harus menampilkan minimal:
- tenant slug
- tenant name
- subdomain
- db name
- db url

### Step 3 — Pilih intent: read atau write
Setelah tenant benar, baru tentukan jenis operasi:
- read-only investigation
- write / repair / import / migration

### Step 4 — Gunakan wrapper sesuai intent
Read-only:
```bash
./scripts/tenant-psql-read.sh kiyowo
./scripts/tenant-psql-read.sh melindo
./scripts/tenant-psql-read.sh melindo path/to/query.sql
printf 'SELECT current_database();\n' | ./scripts/tenant-psql-read.sh kiyowo
```

Write intent:
```bash
./scripts/tenant-psql-write.sh melindo
./scripts/tenant-psql-write.sh melindo path/to/fix.sql
printf 'UPDATE ...;\n' | ./scripts/tenant-psql-write.sh melindo
```

## Required Preflight for Write Operations

Sebelum write, operator wajib bisa menyebut 5 hal ini:
1. tenant target = ?
2. db target hasil resolusi = ?
3. operasi ini read atau write?
4. backup sudah ada atau belum?
5. apakah command/script memakai target DB explicit?

## Kiyowo Special Warning

Untuk tenant `kiyowo`, hasil resolusi akan menunjuk ke DB `polyflow`.

Ini adalah historical naming trap.
Jangan pernah menganggap:
- `polyflow` = “db global”
- `polyflow` = aman dipakai default untuk script destruktif

Dalam praktik:
- read-only query ke Kiyowo: boleh, dengan target tenant eksplisit
- write/destructive change ke Kiyowo: wajib ekstra hati-hati, backup dulu, dan pastikan tenant slug sudah benar

## Script Policy

### Read wrapper
Wrapper read-only harus:
1. menampilkan tenant target
2. menampilkan db target
3. menjalankan `psql` ke DB hasil resolusi
4. tidak meminta konfirmasi destruktif

### Write wrapper
Wrapper write-intent harus:
1. menampilkan tenant target
2. menampilkan db target
3. menampilkan warning besar
4. meminta konfirmasi manual yang eksplisit
5. mengingatkan soal backup dan `DATABASE_URL`

## Operational Language Policy

Selalu gunakan bahasa seperti:
- “cek tenant Melindo”
- “jalankan query read-only ke tenant Kiyowo”
- “backup tenant Melindo sebelum fix data”

Hindari bahasa seperti:
- “masuk ke DB polyflow”
- “jalanin aja ke production DB”

## Safe Examples

### Example A — Cek database target tenant
```bash
./scripts/tenant-db.sh kiyowo
```

### Example B — Query read-only cepat
```bash
printf 'SELECT current_database(), now();\n' | ./scripts/tenant-psql-read.sh melindo
```

### Example C — Jalankan SQL file read-only
```bash
./scripts/tenant-psql-read.sh kiyowo /tmp/check.sql
```

## Unsafe Examples

### Unsafe A
```bash
ssh nugrohopramono "docker exec -i polyflow-db psql -U polyflow -d polyflow"
```
Masalah:
- langsung memakai nama DB mentah
- ambigu: ini Kiyowo, bukan label global

### Unsafe B
```bash
docker exec polyflow-app node /app/prisma/seed.js
```
Masalah:
- tidak ada tenant targeting explicit
- berisiko memakai `DATABASE_URL` default container

## Recommended Habit

Jika ragu, selalu lakukan urutan ini:
1. `./scripts/tenant-db.sh <tenant>`
2. `./scripts/tenant-psql-read.sh <tenant>`
3. baru pertimbangkan operasi write setelah backup dan review

## Related Documents
- `docs/runbooks/tenant-topology-and-db-targeting.md`
- `docs/plans/2026-05-09-tenant-first-guardrails.md`
