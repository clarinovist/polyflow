# Plan: <judul singkat>

Date: YYYY-MM-DD
Author: <nama>
Status: DRAFT | IN_PROGRESS | DONE | BLOCKED
Related Issue/Request: <link / deskripsi>
Risk: Normal | Kritis
Risk reason: <dampak, invariant, caller yang terpengaruh>

> Ikuti root `AGENTS.md`: Ringan dan Normal kecil cukup rencana di chat. File plan wajib
> untuk Kritis, delegasi, atau pekerjaan panjang/multitahap yang perlu handoff.
> Normal boleh ringkas: konteks/dugaan sebab, scope, acceptance criteria, dan verifikasi.
> Kritis gunakan plan lengkap termasuk failure path/rollback; review cukup di rencana ini,
> tanpa hitungan gap atau laporan terpisah. Plan kerja lokal; hanya `_TEMPLATE.md` yang
> ditujukan untuk di-commit. Jangan stage plan rutin atau data tenant/credential.

## 1. Konteks & Root Cause

- Masalah / dampak: ...
- Sebab atau hipotesis (tandai yang belum terverifikasi): ...
- Bukti relevan: ...

## 2. Scope & Acceptance Criteria

- File/modul/caller: ...
- Perilaku yang harus benar setelah patch: ...
- Di luar scope: ...
- Trigger naik ke Kritis bila ditemukan: ...

## 3. Rencana Fix

- Langkah implementasi: ...
- Regression test / branch utama: ...
- Kritis — invariant auth/tenant/keuangan/stok/audit dan failure path: ...
- Schema/migration/data patch (jika ada): tenant target, SQL, validasi, approval eksekusi.
- Rollback/recovery (wajib untuk Kritis): ...

## 4. Review

- Acceptance criteria, regression risk, dan guardrail: ...
- Blocker terhadap keamanan/kebenaran patch yang harus diselesaikan: ...
- Follow-up di luar scope (tidak otomatis ikut dikerjakan): ...

## 5. Verifikasi

> Pilih gate berdasarkan jalur/trigger di root, jangan otomatis menjalankan semua.
> Catat command, scope, hasil, dan alasan N/A. Test wajib di `src/**/__tests__/`.
> Scoped suite yang tercakup full coverage tidak perlu dijalankan dua kali.
> Default environment lokal; container/stack baru hanya bila diperlukan dan sudah mendapat
> approval eksplisit. Jangan gunakan DB produksi atau ganti test DB nyata dengan mock demi cepat.

| Pemeriksaan | Command / scope | Hasil / alasan N/A |
| --- | --- | --- |
| Diff / guard relevan | `git diff --check`, guard bila terdampak | ... |
| Lint (Normal/Kritis) | `npm run lint` | ... |
| Regression / scoped test | `npm run test -- <path-atau-filter>` | ... |
| Typecheck (Normal/Kritis) | `npx tsc --noEmit` | ... |
| Full coverage (Kritis / trigger Normal) | `npm run test:coverage` | ... |
| Manual / domain QA | <alur, invariant, migration sesuai scope> | ... |
| Build lokal (Kritis / trigger Normal) | `npm run build` | ... |

- Hasil terdahulu yang dipakai ulang: <input identik + command/output/exit status>.
- Gate wajib gagal/terblokir: <blocker dan tindak lanjut, jangan klaim lolos>.

## 6. Build & Deploy Notes

- Build lokal bila wajib: terakhir setelah review/gate lain lolos; cek konflik output,
  workspace dan resource, bukan sekadar keberadaan terminal aktif.
- Deploy: approval eksplisit; push `main` memicu deploy otomatis. Artifact commit SHA
  harus lolos gate CI lint, full coverage, dan build image.
- Produksi: ikuti `docs/ops/vps.md` lokal; tidak build di VPS. Bila runbook tidak ada, minta detail.
- Pascadeploy: health/log + smoke test scope; jika schema/data berubah, cek migration dan
  invariant/isi tabel tenant target. Catat hasil aktual, jangan hanya CI green.

## 7. Commit Plan

- Setelah acceptance criteria/guardrail terpenuhi + gate lokal jalur lolos. Build lokal sesuai trigger.
- Message: `fix(<scope>): <judul> (plan: docs/plan/YYYY-MM-DD-<slug>.md)`
- Stage/commit scope sendiri saja, jangan sertakan perubahan sesi lain atau plan lokal.
- Push: tunggu perintah user (push/ship/kirim); edit code bukan approval operasi produksi.
