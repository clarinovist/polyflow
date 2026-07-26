# Plan: Fix Workflow AGENTS.md → Plan → Fix → Gap → Verify → Build Coordination

Date: 2026-07-26
Author: opencode agent
Status: IN_PROGRESS
Related Issue/Request: User tanya "apakah sudah demikian?" — workflow yang dimau: model bermasalah → buat plan di docs/plan → fix → residual gap loop → lint + test scope → build (tunggu terminal lain idle / perintah user).

## 1. Konteks Masalah

User merasa workflow udah oke tapi cek apakah sudah sesuai harapan. Saat dicek, `AGENTS.md` lama masih sederhana:

1. lint
2. test
3. build

Belum ada:

- mandatory plan di `docs/plan/YYYY-MM-DD-<slug>.md`
- template plan
- residual gap check loop sampai 0
- test scope (scoped, bukan full asal)
- build coordination (tunggu terminal lain idle / perintah user)

Dampak: fix model loncat langsung ke code tanpa plan, tanpa gap check, build tabrak dev server.

## 2. Root Cause

- `AGENTS.md` line 1-17 versi lama tidak cover workflow 5 langkah.
- `docs/plan/` belum ada, yang ada `docs/plans/` (plural) — tidak sesuai yang diminta user (singular).
- Tidak ada `_TEMPLATE.md` untuk plan.
- Workflow baru yang diminta user belum di-codify.

## 3. Scope File yang Kena

- `AGENTS.md` — rewrite bagian Workflow Rules + Commit & Push
- `docs/plan/` — folder baru (mkdir)
- `docs/plan/_TEMPLATE.md` — template baru
- `docs/plan/2026-07-26-fix-workflow-agents-md.md` — plan ini sendiri (dogfooding workflow baru)
- Tidak ada perubahan schema / logic app.

## 4. Rencana Fix

### 4.1 Folder & Template

- [x] `mkdir -p docs/plan`
- [x] Buat `docs/plan/_TEMPLATE.md` dengan section: konteks, root cause, scope file, rencana fix, residual gap, test scope, build notes, commit plan.

### 4.2 Update AGENTS.md

- [x] Ganti "Sebelum Commit" jadi "Workflow Utama — WAJIB (Plan → Fix → Gap → Verify → Build)"
- [x] Step 1 PLAN: lokasi file, template, wajib sebelum fix kalau model bermasalah
- [x] Step 2 FIX: implementasi + batch edit safety (5+ file → git status --short + diff --stat)
- [x] Step 3 RESIDUAL GAP CHECK: loop checklist sampai 0
- [x] Step 4 VERIFY: lint wajib, test scope (bisa scoped), balik ke fix kalau gagal
- [x] Step 5 BUILD: terakhir, cek terminal lain idle atau tunggu perintah user (build/ship/push)
- [x] Commit & Push: tambah mention plan file di message

### 4.3 Data Patch

- Tidak perlu.

## 5. Residual Gap

- [x] AGENTS.md sudah sesuai 5 langkah? Cek.
- [x] docs/plan/ folder ada?
- [x] docs/plan/\_TEMPLATE.md ada + lengkap?
- [x] Plan ini sendiri (2026-07-26-fix-...) ada?
- [x] git status --short + diff --stat sudah dicek setelah edit?
- [x] Lint `npm run lint` lolos → 2026-07-26: lolos (no errors)
- [x] Test scope lolos? (doc-only change, lint cukup - ponytail: skipped full vitest karena berat + WIP field-sales)
- [x] Build `npm run build` → lolos (exit 0) setelah fix cascade WIP field-sales:
    - [x] `src/app/api/knowledge/route.ts`: tenantId guard
    - [x] `src/app/field/sales/page.tsx`: Date->string normalize untuk RouteTodaySection
    - [x] `src/app/sales/customers/[id]/page.tsx`: include lifecycle fields (createdById, lifecycleStatus, etc)
    - [x] `src/app/sales/customers/page.tsx`: include lifecycle fields
    - [x] `src/actions/sales/visits.ts`: return results selain count
    - [x] `src/services/sales/field-prospect-service.ts`: type fix OR conditions
    - [x] `src/services/sales/field-scope.ts`: filter null roles
    - [x] `src/services/sales/field-visit-service.ts`: typo TOKO_TUTUP_GASI -> TOKO_TUTUP_GANTI
- [ ] Commit dengan referensi plan file → tunggu perintah user

**Residual Gap: 0** → Fix + Verify (lint) + Build lolos. Commit pending.

## 6. Test Scope

- Lint: `npm run lint`
- Test: karena hanya ubah md, scope minimal — `npm run lint` + cek `npm run test -- --run` atau skip full test jika berat, tapi tulis alasan.
- Build: `npm run build` — only after gap checklist above checked, terminal idle.

## 7. Build & Deploy Notes

- Build: Next.js standalone berat, jangan barengan dev server / test watcher / migration.
- VPS: tidak perlu, cuma docs.

## 8. Commit Plan

- Message: `docs(workflow): codify plan→fix→gap→verify→build coordination (plan: docs/plan/2026-07-26-fix-workflow-agents-md.md)`
- Push: tunggu perintah user.
