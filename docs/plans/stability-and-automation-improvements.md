# Polyflow Stability & Automation Improvements — Implementation Plan

Berdasarkan analisis insiden operasional berulang dalam 1 bulan terakhir, rencana ini disusun untuk mengatasi 5 akar masalah operasional melalui otomatisasi, observabilitas, dan stabilitas infrastruktur. Rencana ini mencakup 7 fase perbaikan.

---

## Kondisi Saat Ini (Baseline)

| Aspek | Status |
|-------|--------|
| CI/CD | ✅ `build.yml`: test → build Docker → deploy via SSH |
| Testing | ⚠️ ~5 file test (sebagian stub), Vitest configured |
| Error Tracking | ❌ Tidak ada (cek manual ke terminal) |
| Admin Panel | ⚠️ Ada `/admin/super-admin` dan `/admin/database-assistant` |
| Audit Log | ⚠️ Backend `logActivity()` ada, UI belum ada |
| Health Endpoint | ⚠️ `/api/health` ada tapi minimal |
| Nginx Config | ❌ Tidak di-track di Git |

---

## Phase 1: Error Tracking & Monitoring

**Tujuan:** Menghilangkan kebiasaan cek error manual ke VPS dan reaktif terhadap insiden.

1. **Error Tracking (Sentry)**
   - Integrasikan `@sentry/nextjs`
   - Setup global Error Boundary di root layout
2. **Extended Health Endpoint**
   - Perluas `/api/health/route.ts` untuk cek DB, memory, disk space, cronjob
3. **System Health Admin Page**
   - Buat halaman `/admin/system-health` di admin panel untuk visualisasi metrik kesehatan

---

## Phase 2: Automated Testing & CI/CD Gate

**Tujuan:** Mencegah bug finansial dan regresi lolos ke UI / Production.

1. **Test Infrastructure Pipeline**
   - Setup global mock di `tests/setup.ts` (Prisma, next/cache, audit)
2. **Unit Tests Alur Kritis Akuntansi**
   - `accounting-service`: auto-journal (Goods Receipt → Trade Payables), validasi balance jurnal
   - `inventory-link-service`: production backflush journal
   - `costing-service`: COGM, WIP valuation
3. **CI/CD Quality Gate**
   - Tambah coverage threshold di `build.yml`
   - Test harus hijau sebelum GitHub Actions bisa build image

---

## Phase 3: Smart Error Handling & Self-Healing

**Tujuan:** Mencegah aplikasi crash untuk urusan sepele dan memberikan informasi error yang masuk akal ke user.

1. **"Smart Retry" Pattern**
   - Utility backoff eksponensial untuk request external (seperti Image Generation di Gemini)
2. **User-Friendly Error Messages**
   - Mapping system error code ke instruksi spesifik (misal: "Prompt mengandung kata terlarang" untuk error safety filter)
3. **Error Boundary Per Modul**
   - Fallback UI modular agar error di satu halaman tidak membuat aplikasi blank putih

---

## Phase 4: Admin Operations Dashboard

**Tujuan:** Mempermudah tim admin menanggulangi issue kecil dan operasi harian tanpa melibatkan intervensi database manual.

1. **Credit Management UI**
   - Tambah/hapus kredit user via `/admin/credits` lengkap dengan validasi SUPER_ADMIN
2. **Audit Log Viewer**
   - UI grid di `/admin/audit-logs` untuk membaca semua record `logActivity` beserta filter dan before/after diff logic.
3. **Cronjob Status Check**
   - Indikator real-time kapan report email otomatis terakhir berhasil dikirim di dashboard sistem operasi

---

## Phase 5: Infrastructure as Code (IaC)

**Tujuan:** Perubahan konfigurasi mesin bisa dilacak dan divalidasi dengan Git.

1. **Nginx Config Repo**
   - Tarik reverse proxy Nginx di VPS ke repo `nginx/polyflow.conf`
2. **Environment Variables Documentation**
   - Update `.env.example` dengan semua context variable yang terpakai
3. **CI Nginx Syntax Check**
   - Tambahkan `nginx -t` validation phase di CI

---

## Phase 6: Polyflow Doctor

**Tujuan:** Kemampuan diagnostik cepat (Self-diagnostic tool untuk Admin dan Developer).

1. **Diagnostic API & CLI**
   - Endpoint `/api/admin/diagnostics` dan NPM script `npm run doctor`
   - Cek lengkap: Database conn, redis conn, cronjob delay, storage cap, environment completeness.

---

## Phase 7: Auto-Changelog & Migration Safety

**Tujuan:** Komunikasi ke user transparan, update database aman tanpa risiko hilangnya data.

1. **Auto-Changelog Banner**
   - Pop-up dismissable notice "New Update Deployment" di UI klien dengan summary dari `CHANGELOG.md`
2. **Pre-migration Database Snapshot**
   - Setup bash command di container `entrypoint.sh` untuk melakukan `pg_dump` mini sebelum step `prisma migrate deploy` dijalankan. Rotasi setidaknya 5 backup file di environment VPS.
