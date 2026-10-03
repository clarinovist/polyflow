# CI dan rilis terjadwal

`Production Pipeline` tidak berjalan pada setiap push `main`. Push mengumpulkan
perubahan di branch tanpa build atau deploy. Workflow merilis HEAD `main` sekali
per hari kerja pada `14:17 UTC` (`21:17 WIB`, Senin–Jumat), atau saat operator
menjalankan dispatch manual untuk kebutuhan mendesak.

Push biasa menjalankan **Push CI** (`ci.yml`): lint + typecheck cepat untuk umpan
balik sebelum rilis, tanpa build image atau deploy. Push yang seluruh delta-nya
dokumen aman melewati langkah berat lewat classifier yang sama
(`scripts/ci/changes.mjs`). Pengaturan ini mengurangi frekuensi pipeline rilis,
bukan kualitas pemeriksaannya. Setiap scheduled/manual release tetap menjalankan
seluruh gate sebelum image dipromosikan atau VPS diubah.

## Jalur release

| Event | Hasil |
| --- | --- |
| Push ke `main` | Push CI (lint + typecheck; skip langkah berat untuk docs-only); tidak build/deploy; commit menunggu release berikutnya |
| Schedule hari kerja | Full gates, Release Please, build image, lalu deploy HEAD `main` |
| Manual **Run workflow** pada `main` | Full gates, build image, lalu deploy; Release Please dilewati |

Workflow harus dijalankan pada `main`. Deploy memerlukan:

- konsistensi AGENTS dan versi Node;
- lint;
- dua shard seluruh test dan merge coverage global **71/63/75/72**;
- validasi Nginx;
- PostgreSQL contract + full TypeScript validation;
- JEV provider contract; dan
- image production hasil Buildx.

`Status CI` fail-closed: schedule/dispatch dengan gate gagal, cancelled, atau skip
yang tidak semestinya dinyatakan gagal. Deploy tetap memakai digest immutable dari
run yang sama. Revision guard membandingkan SHA run dengan HEAD `main` tepat sebelum
promosi image/SSH; jika push baru masuk saat run berlangsung, release lama sukses
sebagai verifikasi tetapi tidak mengganti produksi.

## Rilis mendesak

Push dahulu, lalu dispatch workflow pada branch `main`:

```bash
gh workflow run production.yml --repo clarinovist/polyflow --ref main
gh run list --repo clarinovist/polyflow --workflow production.yml --branch main --limit 5
gh run watch <id-run> --repo clarinovist/polyflow --exit-status
```

Dispatch manual **bukan** shortcut yang memakai image lama. Workflow membangun image
SHA terbaru, menjalankan semua gate, lalu deploy hanya jika SHA itu masih HEAD. Ini
jalur yang benar jika perubahan mendesak belum memiliki image teruji.

Rerun seluruh workflow, bukan failed jobs saja: manifest coverage mengikat run
attempt, SHA, dan fingerprint sehingga artifact lintas attempt sengaja ditolak.

## Perkiraan penghematan

Sepuluh run sukses sebelum perubahan ini rata-rata menggunakan sekitar **17,55
runner-menit**. Terdapat 14 run dalam empat hari (sekitar 3,5 per hari). Lima release
terjadwal per minggu dibanding pola sekitar 24,5 run per minggu memberi estimasi
pengurangan **79,6% runner-minutes**, selama dispatch urgent jarang. Ini estimasi dari
occupancy job, bukan tagihan pasti; tinjau kembali metrik sesudah sedikitnya dua minggu.

Penghematan berasal dari membatch commit, bukan dari melewati test. Push yang membutuhkan
release sebelum jadwal harus memakai dispatch manual, bukan SSH langsung dengan image
yang belum dibangun/diuji.

## Rollback

Untuk memulihkan release-per-push, revert perubahan trigger/status dengan commit baru,
lalu dispatch workflow manual agar commit rollback menjalani full gates. Jangan
mengubah threshold, menghapus gate deploy, menggunakan image SHA yang belum seluruh
gatenya sukses, atau build langsung di VPS.

Sebelum operasi produksi, baca runbook privat `docs/ops/vps.md`; setelah deploy,
verifikasi image yang berjalan, health, migration status, dan log startup. CI hijau
sendiri bukan bukti container terbaru aktif.

## Branch protection

`main` dilindungi: push wajib memiliki required check `Classify changes` dan
`Lint & Typecheck` (job `ci.yml`) yang sukses, serta dilarang force-push dan
delete. Owner tetap dapat bypass (`enforce_admins: false`) bila perlu. Push
docs-only tetap diterima — `Lint & Typecheck` melewati langkah berat lewat
classifier yang sama.
