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
> Kritis kecil cukup satu catatan sesuai root: scope/target, bukti awal → hasil yang diharapkan,
> langkah, invariant, verifikasi, dan failure path/rollback. Koreksi data juga memuat backup dan
> pencegahan eksekusi ganda. Gunakan bagian relevan di bawah, bukan wajib menyalin semua bagian;
> review di catatan yang sama, tanpa laporan pendamping. Plan kerja lokal; hanya `_TEMPLATE.md`
> yang ditujukan untuk di-commit. Jangan stage plan rutin atau data tenant/credential.

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
> Operasi data lewat alur rilis yang tidak berubah mengikuti bukti gate artifact yang sama dan
> verifikasi operasi di root; bukan otomatis full coverage/build ulang. Skrip baru tetap perlu
> review dan uji jalur eksekusinya di lingkungan terisolasi, bukan hanya bukti uji service lama.
> Lokal untuk pemeriksaan ringan; full coverage, build, dan integration/E2E utamakan CI/remote
> terisolasi. Jangan otomatis membuat container lokal. Jangan gunakan DB produksi atau ganti
> test DB nyata dengan mock demi cepat.

| Pemeriksaan | Command / scope | Hasil / alasan N/A |
| --- | --- | --- |
| Diff / guard relevan | `git diff --check`, guard bila terdampak | ... |
| Lint (Normal/Kritis) | `npm run lint` | ... |
| Regression / scoped test | `npm run test -- <path-atau-filter>` | ... |
| Typecheck (Normal/Kritis) | `npx tsc --noEmit` | ... |
| Full coverage (Kritis / trigger Normal) | `npm run test:coverage` | ... |
| Manual / domain QA | <alur, invariant, migration sesuai scope> | ... |
| Build produksi (CI diutamakan) | `npm run build` / image build CI | ... |

- Hasil terdahulu yang dipakai ulang: <input identik + command/output/exit status>.
- Gate wajib gagal/terblokir: <blocker dan tindak lanjut, jangan klaim lolos>.

## 6. Build & Deploy Notes

- Build produksi utamakan CI; bila reproduksi lokal diperlukan, cek konflik output,
  workspace dan resource, bukan sekadar keberadaan terminal aktif.
- Push/deploy dalam scope diizinkan sesuai root; push `main` memicu deploy otomatis.
  Artifact commit SHA harus lolos gate CI lint, full coverage, build image, dan gate domain terkait.
- Produksi: ikuti `docs/ops/vps.md` lokal; tidak build di VPS. Bila runbook tidak ada, minta detail.
- Pascadeploy: health/log + smoke test scope; jika schema/data berubah, cek migration dan
  invariant/isi tabel tenant target. Catat hasil aktual, jangan hanya CI green.

## 7. Commit Plan

- Setelah acceptance criteria/guardrail terpenuhi + pemeriksaan lokal terjangkau lolos.
  Gate berat boleh melalui push CI, wajib lolos sebelum deploy.
- Message: `fix(<scope>): <judul> (plan: docs/plan/YYYY-MM-DD-<slug>.md)`
- Stage/commit scope sendiri saja, jangan sertakan perubahan sesi lain atau plan lokal.
- Push dalam scope diizinkan sesuai root; pantau CI pada SHA yang benar dan verifikasi pascadeploy.
  Hormati pembatasan terbaru user; izin rilis bukan izin transaksi bisnis atau data patch destruktif.
