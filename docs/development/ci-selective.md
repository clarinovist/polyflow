# CI sesuai perubahan

`Production Pipeline` tetap berjalan pada setiap push `main`; tidak ada filter
seluruh workflow atau opsi untuk memaksa perubahan kode dianggap dokumentasi.
Job **AGENTS.md Consistency** selalu memeriksa panduan, kesesuaian Node, serta
klasifikasi perubahan. Job ini sekarang juga menjadi gate awal, bukan hanya
pemeriksaan paralel yang tidak menahan deploy.

## Jalur otomatis

| Seluruh delta push | Pemeriksaan |
| --- | --- |
| Hanya dokumen daftar aman | Konsistensi AGENTS/Node, teks dan tautan dokumen, lalu Status CI |
| Kode, konfigurasi, kontrak, berkas tidak dikenal, atau campuran | Gate awal + lint, dua shard seluruh test, merge coverage global/Nginx, PostgreSQL/typecheck, build image dan jalur rilis existing |
| Riwayat Git/event tidak pasti atau delta kosong | Jalur lengkap; kegagalan pemeriksaan awal tetap menahan job berikutnya |

Daftar aman tertutup di `scripts/ci/changes.mjs`:

- `README.md`
- `docs/README.md`
- `docs/development/ci-selective.md`

Tidak semua `*.md` aman: runbook, kontrak domain, panduan agent, dokumen CI
performance, dan file baru tetap lengkap sampai ditinjau khusus. Perubahan
allow-list/helper sendiri merupakan perubahan kode yang menjalani gate lengkap.
Daftar aman saat ini bukan input aplikasi/image; `docs/` dan README root juga
sudah dikecualikan dari build context.

Classifier memakai seluruh diff `before..after`, bukan hanya commit terakhir
atau daftar path API yang dapat terpotong. Rename diperiksa sebagai delete+add.
SHA checkout/event harus cocok dan `before` harus ancestor; forced push, riwayat
hilang, kegagalan Git, atau path tidak dikenal tidak boleh memilih jalur ringan.

Jalur dokumen tidak memasang dependency aplikasi, menjalankan database/test
coverage, build/publish image, Release Please, timing berat, atau SSH/deploy.
Dokumen yang tersisa dalam allow-list diperiksa sebagai teks UTF-8 reguler,
tanpa konflik merge, dengan target tautan inline lokal yang tersedia di repo.
Pemeriksaan ini tidak memvalidasi anchor, link eksternal, semua sintaks Markdown,
makna dokumen, atau secret di dalam isi. Hook data-file/tenant-name lokal dan
review manusia tetap wajib; sidecar privat tidak dikirim ke CI.

## Manual: verifikasi lengkap tanpa deploy

**Actions → Production Pipeline → Run workflow → main** menjalankan verifikasi
lengkap. Dispatch manual tidak membuat release PR, mempromosikan `latest`, atau
menjalankan deploy. Build masih memublikasikan image bertag SHA; image bukan
izin rilis sebelum gate lain lulus.

```bash
gh workflow run production.yml --repo clarinovist/polyflow --ref main
gh run list --repo clarinovist/polyflow --workflow production.yml --branch main
gh run watch <id-run> --repo clarinovist/polyflow --exit-status
```

Rerun **seluruh workflow**, bukan failed jobs saja: manifest coverage existing
mengikat run attempt, SHA dan fingerprint sehingga artifact lintas attempt
sengaja ditolak. Workflow benchmark manual dan pruning terjadwal tidak diubah.

## Status CI dan gate rilis

Check **Status CI** selalu berjalan. Ia menolak output klasifikasi kosong atau
invalid, job wajib yang gagal/dibatalkan, dan skip di luar jalur yang dipilih:

- Dokumen: initial sukses, seluruh heavy/release/deploy skipped.
- Lengkap push: initial, semua heavy gate, Release Please dan job deploy sukses.
  Guard SHA existing dapat melewati operasi rilis bila main sudah lebih baru;
  job sukses sendiri bukan bukti container diganti.
- Lengkap manual: semua gate verifikasi sukses; Release Please/deploy skipped.

Gunakan **Status CI** bila kelak mengaktifkan required checks lintas jalur.
`Test & Validate` tetap nama gate merge coverage, tetapi skipped pada dokumen.
Konfigurasi branch protection tidak diubah oleh optimasi ini.

Deploy push tetap menunggu `test`, `lint`, `build-and-push`, dan `return-contract`;
semuanya bergantung pada keberhasilan initial. Coverage global **71/63/75/72**,
validasi Nginx, PostgreSQL nyata/typecheck, serialisasi deploy, guard main terbaru,
serta SHA/digest yang diuji tidak dikurangi. Tidak ada reuse hasil test atau
subset suite aplikasi berdasarkan path. Penjadwalan shard/identity dijelaskan
di [CI performance](ci-performance.md).

**CI dokumen hijau bukan bukti kelayakan rilis**: tidak ada image baru atau
pemasangan ulang aplikasi. Sebelum operasi produksi, tetap baca runbook privat
`docs/ops/vps.md` dan verifikasi image/health. Penghematan berasal dari job yang
tidak dimulai; durasi paralel dijumlahkan sebagai runner occupancy, bukan satu
job atau angka tagihan yang dapat diasumsikan.
