# Plan: <judul singkat>

Date: YYYY-MM-DD
Author: <nama>
Status: DRAFT | IN_PROGRESS | DONE
Related Issue/Request: <link / deskripsi>

## 1. Konteks Masalah

> Apa yang rusak / diminta? Kenapa kritis? Dampak bisnis?

- ...
- ...

## 2. Root Cause

> Hasil investigasi: model mana, logic mana, data sample kalau ada.

- Model: `prisma/schema.prisma` — `ModelName`
- Logic: `src/modules/...`
- Data evidence: ...

## 3. Scope File yang Kena

- `src/...`
- `prisma/...`
- `src/...`

## 4. Rencana Fix

### 4.1 Schema / Migration (jika ada)
- ...

### 4.2 Code Change
- Step 1: ...
- Step 2: ...

### 4.3 Data Patch (jika perlu)
- SQL / script: ...

## 5. Residual Gap

> Update setelah fix. Loop sampai 0.

- [ ] Gap 1: ...
- [ ] Gap 2: ...

**Residual Gap: N** → target 0 sebelum verify.

## 6. Test Scope

- Lint: `npm run lint`
- Test: `npm run test -- <scope>` atau `vitest run <path>`
- Manual QA: ...

## 7. Build & Deploy Notes

- Build: `npm run build` — hanya setelah gap 0 + lint + test lolos + terminal lain idle / perintah user.
- VPS check after deploy: `docker logs...`, `migrate status`, `Help*` counts, `docker ps`.

## 8. Commit Plan

- Message: `fix(<scope>): <judul> (plan: docs/plan/YYYY-MM-DD-<slug>.md)`
- Push: tunggu perintah user (push/ship/kirim).
