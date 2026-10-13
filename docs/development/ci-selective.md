# CI dan rilis terjadwal

`Push CI` adalah satu-satunya produsen artifact rilis. Untuk perubahan non-dokumentasi,
workflow ini menjalankan lint, route generation + full TypeScript validation, kontrak JEV,
dua shard seluruh test dengan merge coverage global **71/63/75/72**, validasi Nginx,
dua kontrak PostgreSQL disposable, worker build/smoke, lalu build+push web dan worker image.
Setelah seluruh gate sukses, job stabil `Push CI Status` menerbitkan manifest immutable
yang mengikat repository, commit SHA, run ID, run attempt, dan kedua image digest.

`Production Pipeline` tidak menjalankan source test atau build ulang. Pada jadwal hari
kerja `14:17 UTC` (`21:17 WIB`) atau dispatch manual, pipeline memverifikasi Push CI,
mengunduh manifest exact run, memeriksa identitas/digest, lalu promote, backup, migrate,
dan deploy ke VPS. Release Please tetap berjalan independen pada schedule.

## Jalur release

| Event | Hasil |
| --- | --- |
| Push non-docs ke `main` | Seluruh gate rilis + build image SHA + manifest release; tidak deploy |
| Push docs-only aman | Classifier + status stabil; gate berat/build dilewati dan tidak membuat manifest |
| Schedule hari kerja | Verifikasi manifest Push CI terbaru yang sah lalu migrate/deploy; Release Please berjalan |
| Manual **Run workflow** | Verifikasi manifest Push CI terbaru yang sah lalu migrate/deploy; Release Please dilewati |

Jika HEAD hanya menambahkan dokumen dalam allowlist tertutup setelah full push terakhir,
Production boleh memakai artifact full ancestor tersebut. Ini fail-closed: artifact SHA
harus ancestor dari HEAD saat workflow mulai, setiap commit perantara harus linear, dan
setiap path yang pernah disentuh harus berada dalam allowlist `safeDocuments`. Merge,
path non-allowlist, history/API/artifact yang hilang, manifest kedaluwarsa, identitas
run-attempt berbeda, atau bukti ambigu memblokir deploy.

## Gate dan identitas artifact

Deploy memerlukan `Push CI Status` sukses pada exact HEAD dan manifest release dari full
Push CI sukses. Manifest hanya diterbitkan sesudah semua dependency berikut sukses:

- lint, full TypeScript, dan JEV contract;
- dua test shard, complete discovery, merge coverage global, dan Nginx;
- return/identity PostgreSQL contracts;
- durable assistant PostgreSQL/crash contract, worker build, dan health smoke;
- web + worker Docker build/push bertag SHA.

Tag SHA hanya alamat informasional; deploy memakai digest immutable dari manifest. Nama
artifact memuat run ID, run attempt, dan SHA. Rerun harus seluruh Push CI workflow agar
attempt dan artifact tidak tercampur. Manifest dan SHA image availability diselaraskan
pada jendela 14 hari; bila bukti/image sudah tidak tersedia, buat commit/push baru dan
jangan bypass readiness.

Revision guard membandingkan remote `main` dengan SHA HEAD saat Production mulai sebelum
registry atau SSH mutation. Untuk docs-only ancestor, checkout dan image tetap memakai
artifact SHA, sedangkan guard current-main tetap memakai workflow-start HEAD. Push baru
yang masuk di tengah release membuat run lama menjadi no-op sebelum mutation.

## Rilis mendesak

Push dahulu dan tunggu `Push CI Status` hijau, lalu:

```bash
gh workflow run production.yml --repo clarinovist/polyflow --ref main
gh run list --repo clarinovist/polyflow --workflow production.yml --branch main --limit 5
gh run watch <id-run> --repo clarinovist/polyflow --exit-status
```

Dispatch manual bukan shortcut untuk image lama atau tag mutable. Pipeline hanya menerima
manifest Push CI yang lolos dan masih tersedia. Produksi tidak membangun source dan tidak
mengulang test, sehingga deploy memanfaatkan bukti identik tanpa mengurangi gate.

## Rollback

Untuk rollback deterministik, gunakan commit/artifact yang gate-nya pernah sukses dan
image digest masih tersedia; jangan menggunakan `latest` sebagai identitas. Perubahan
schema tetap mengikuti kompatibilitas/restore plan. Jika workflow artifact perlu
dibatalkan, revert dengan commit baru sehingga rollback itu sendiri menjalani Push CI.

Sebelum operasi produksi, baca runbook privat `docs/ops/vps.md`. Sesudah deploy, cocokkan
runtime image dengan manifest digest, cek health/log/migration, dan lakukan smoke read-only.
CI hijau sendiri bukan bukti container baru aktif.

## Branch protection

`main` memakai required check stabil `Push CI Status`, terikat ke GitHub Actions app.
Status full hanya hijau jika seluruh gate dan image build sukses. Untuk docs-only, status
hanya menerima pola eksplisit: `Lint & Typecheck` sukses melalui langkah ringan dan semua
job berat/build skipped. Owner masih dapat bypass (`enforce_admins: false`), tetapi
Production readiness tetap menolak bukti Push CI/artifact yang tidak sah.
