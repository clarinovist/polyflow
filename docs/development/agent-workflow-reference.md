# Referensi Workflow Agent

Kebijakan jalur dan gate ada di [`AGENTS.md`](../../AGENTS.md). Dokumen ini berisi
prosedur pendukung; baca hanya bagian yang terkait task. Tidak menambah gate universal
atau mengganti jalur Ringan/Normal/Kritis. Ringan dan Normal kecil cukup rencana di chat;
file plan untuk Kritis, delegasi, atau pekerjaan panjang/multitahap yang perlu handoff.

## Coverage: diagnosis tanpa menurunkan standar

- Sumber konfigurasi: `vitest.config.ts`, provider `v8`, threshold
  **71/63/75/72** (statements/branches/functions/lines), target 80%.
- Coverage dihitung pada surface yang dieksekusi test, tanpa broad `include`. Menambah
  test untuk modul yang sebelumnya tidak tersentuh bisa menurunkan rasio global:
  anggarkan happy path dan branch utama, bukan hanya satu test agar modul ter-cover.
- Service/action/lib baru ≥100 baris harus punya test di `src/**/__tests__/`.
  Kode lebih pendek tetap perlu regression test bila mengubah logika.
- Kalau coverage gagal, jalankan `npm run test:coverage`, cari persentase terendah dan
  daftar uncovered lines/branches di tabel, lalu tambah test yang relevan.
  Perbarui rencana aktif; kebutuhan file plan tetap mengikuti root, bukan otomatis wajib.
- Jangan turunkan threshold atau exclude service produksi demi meloloskan CI. Exclusion
  hanya untuk declaration (`*.d.ts`), `src/lib/schemas/**`, `src/generated/**`, serta file
  test/`__tests__` sesuai konfigurasi yang sudah ada. Perubahan konfigurasi perlu review,
  bukan jalan pintas mengatasi coverage gagal.
- Normal boleh menyerahkan full coverage ke CI kecuali trigger lokal di root berlaku.
  Kritis wajib lokal. Coverage gagal di CI tetap memblokir deploy, meski scoped test lolos.
- `vitest` lolos bukan bukti TypeScript bersih: gunakan `npx tsc --noEmit` sesuai jalur,
  termasuk untuk file test. Jangan mengklaim CI punya standalone typecheck tanpa memeriksa
  workflow aktual; saat revisi ini CI menjalankan coverage dan build image, bukan gate
  terpisah `tsc --noEmit` seluruh project.

## Pi worker: dispatch dan review

Delegasi opsional, bukan cara menghindari tanggung jawab orchestrator. Default provider/model
mengikuti sesi; worker penulis code/migration/test minimum tier Sonnet. Task mekanis bounded
saja yang boleh memakai tier lebih rendah. Pembatasan model repo ini mengalahkan saran global
yang lebih longgar. Gunakan Pi untuk worker; jangan memakai OpenCode.

1. Baca root/module AGENTS, tentukan jalur risiko, buat plan lokal, dan batasi ownership file.
2. Minta persetujuan eksplisit user **sebelum tiap dispatch** dan cek `command -v pi`.
3. Prompt minimum: plan/AGENTS yang dibaca, file yang boleh diubah, acceptance criteria,
   test scope, serta larangan commit/push/deploy/operasi database produksi.
4. Headless memakai `--print --approve` agar proses noninteraktif dapat memakai tool setelah
   approval dispatch. Secara default jangan set provider/model agar mewarisi sesi. Bila user
   meminta model tertentu, set keduanya secara eksplisit dan verifikasi dengan `pi --list-models`:

   ```bash
   pi --print --approve \
     --provider <provider-yang-disetujui> \
     --model <model-yang-disetujui> \
     "Baca AGENTS.md, AGENTS modul terkait, dan docs/plan/<plan>.md. Ubah hanya <scope>. Acceptance criteria: <criteria>. Test: <scope test>. Jangan commit, push, deploy, mengakses credential, atau menjalankan operasi database produksi. Jangan build tanpa koordinasi orchestrator."
   ```

5. Untuk task panjang, boleh tmux dan log di `/tmp`, bukan root repo. Nama sesi/log harus
   unik; jangan menimpa worker yang masih aktif. Contoh (ganti placeholder sebelum jalan):

   ```bash
   tmux new-session -d -s pi-worker-<task> \
     "cd '$PWD' && pi --print --approve '<prompt bounded lengkap>' > /tmp/pi-worker-<task>.log 2>&1"
   ```

6. Pantau log/progres. Sesi hidup atau exit `rc=0` bukan bukti ada perubahan yang benar.
7. Orchestrator memeriksa `git status --short`, `git diff --stat`, dan `git diff` aktual.
   Jika worker stage file tanpa izin, periksa diff cached juga; jangan unstage seluruh index.
8. Review acceptance criteria, regresi/guardrail, dan jalankan gate jalur yang belum terbukti lolos.
   Hasil worker boleh dipakai jika command/output/exit status tersedia, input relevan masih
   identik, dan orchestrator memeriksanya. Jika ada perubahan atau bukti meragukan, ulangi.
9. Setelah patch code final, orchestrator memastikan `graphify update .` sudah dilakukan.

**Batas tetap:** satu writer per file; overlap memakai worktree. Jangan kirim secret,
production connection string atau data tenant sensitif ke prompt/log. Operasi produksi,
credential, commit/push/deploy hanya orchestrator dengan approval yang diperlukan.
Worker tidak boleh menghentikan proses sesi lain. Scope melenceng → hentikan dan review
sebelum meneruskan, tanpa membuang perubahan milik sesi lain.

Delegasi bisa mengurangi konteks orchestrator, bukan jaminan biaya total lebih kecil.
Hindari duplikasi eksplorasi/test dan prompt terlalu luas; biaya rework bisa menghapus
penghematan. Jangan menurunkan model hanya untuk mengejar biaya nominal.

## Hooks & perlindungan data

Aktifkan sekali per clone:

```bash
git config core.hooksPath .githooks
```

`.githooks/pre-commit` memeriksa:

| Guard | Kapan / apa yang diperiksa |
| --- | --- |
| AGENTS consistency | Saat `AGENTS.md` ter-stage; menjalankan `bash scripts/check-agents-consistency.sh` |
| Data-file | File tabular; SQL berisi baris data di luar migration |
| Tenant-name | Nama file dan baris ditambahkan, berdasarkan `.githooks/sensitive-names.local` |

- Sidecar tenant-name gitignored. **Tidak ada sidecar = guard tenant-name tidak aktif.**
  Siapkan kembali di clone baru; tambah pola tenant baru sebelum menulis dokumen tentangnya.
- Plan/topologi/data kerja tetap lokal di `docs/plan/` atau `docs/ops/`. Private repo tetap
  bisa dibaca kolaborator/integrasi; menghapus file tidak menghapusnya dari histori/clone.
- Bypass teknis yang tersedia adalah `ALLOW_DATA_FILES=1` dan `ALLOW_TENANT_NAMES=1`;
  masing-masing hanya melewati satu guard. **Bukan izin agent untuk melewati guard.**
  Jika file legitimate terblokir, jelaskan alasannya dan minta approval eksplisit;
  pindahkan informasi sensitif ke lokasi lokal bila tidak perlu tracked.
- Guard konsistensi memeriksa struktur/routing, bukan seluruh makna aturan. Perubahan
  workflow harus direview juga terhadap `.agents/AGENTS.md` dan template plan agar tidak
  ada gate lama yang masih menduplikasi kebijakan root.

## Environment lokal, Node & container

**Default: pakai environment lokal yang memadai, bukan membuat container baru.**
Jalur Kritis menentukan kedalaman verifikasi, bukan kewajiban memakai Docker.

| Kebutuhan | Pilihan environment |
| --- | --- |
| UI, lint, typecheck, unit test/mock | Lokal; tidak perlu stack baru |
| Integration test PostgreSQL | DB test terisolasi yang tersedia dan aman; bukan DB produksi |
| DB test belum tersedia, reproduksi khusus Linux/container, perubahan runtime/native dependency/Dockerfile | Container boleh bila kebutuhan konkret tidak terpenuhi lokal, setelah approval |
| Build image rilis | CI sesuai gate root; tidak build di VPS |

Sebelum membuat container, menarik/build image lokal, atau provisioning stack baru:
jelaskan kebutuhan verifikasi, alternatif lokal, resource yang akan dibuat, dan minta
approval eksplisit. Jangan mengganti test DB nyata dengan mock demi cepat. Jika environment
wajib belum tersedia/disetujui, laporkan blocker, bukan skip diam-diam.

`.nvmrc` dan base image `Dockerfile` harus sama; CI memakai `node-version-file: '.nvmrc'`.
Perubahan Node/dependency/runtime masuk Kritis. Setelah update versi, jalankan
`bash scripts/check-node-version.sh`; runtime berbeda dapat mengubah perilaku/coverage.

**Hanya jika container memang diperlukan dan disetujui:** gunakan resource bernama unik,
DB test terisolasi tanpa data/credential produksi, dan salinan workspace yang memuat patch
aktual. `git archive HEAD` saja tidak memuat patch working tree. Jangan mount root repo
untuk `npm ci` container karena dapat menimpa `node_modules` host. Bersihkan hanya resource
milik tugas yang tidak lagi dipakai; jangan Docker prune atau mengganggu container sesi lain.

## Recovery & arsip khusus

Aturan workspace/cleanup rutin cukup mengikuti root, tidak perlu checklist tambahan.
Jika perubahan hilang, bandingkan diff/index/backup; jangan memakai marker insiden lain
secara buta. Bila bukti test/rilis perlu diarsipkan, simpan privat di luar Git, verifikasi
isi/hash sebelum menghapus sumber, lalu catat lokasi di catatan lokal tanpa data sensitif.
Izin cleanup lokal bukan izin menghapus artefak produksi, restart layanan, atau mengubah
retensi/backup; operasi tersebut tetap perlu approval eksplisit.

## Audit status

Saat menyentuh status/audit, baca `src/lib/AGENTS.md`. Audit otomatis memakai
`withStatusAudit` di `src/lib/core/prisma-audit-extension.ts`; tambah model berstatus ke
`AUDITABLE_MODELS`. Extension memakai outer client, bukan `tx`: cancel/confirm/ship dan
operasi kritis tetap wajib manual `logActivity` di dalam transaction. Timeline UI memakai
`src/components/shared/EntityStatusTimeline.tsx`.

## Commit dengan index campuran

Gate/approval commit dan rilis mengikuti root. Jika index berisi WIP sesi lain, gunakan
pathspec scope sendiri, bukan `git commit -a`/seluruh index. Pathspec mengambil isi
working tree: pisahkan kepemilikan file campuran dahulu. Pesan jelas, sebut plan bila ada
(`plan: docs/plan/...`). Prosedur rilis ada di `docs/ops/vps.md` lokal, bukan referensi ini.

## Pelajaran insiden yang dipertahankan

Riwayat ini menjelaskan guard, bukan menambah ritual untuk setiap task:

| Pelajaran | Guard yang relevan sekarang |
| --- | --- |
| Test di direktori root pernah tidak masuk discovery vitest | Simpan test di `src/**/__tests__/` dan pastikan scope benar-benar mengeksekusinya |
| Modul baru yang diuji dapat menurunkan coverage global | Anggarkan branch test; perbaiki test, bukan threshold |
| Rewrite/worker dapat menghilangkan edit workspace | Satu writer, review diff aktual, checkpoint stage scope sendiri |
| Status audit via outer client tidak atomic dengan transaksi | Operasi kritis wajib manual audit dalam `tx`; lihat `src/lib/AGENTS.md` |
| Runtime dev/CI/produksi pernah drift | `.nvmrc` + Dockerfile konsisten, jalankan guard Node |
| Worker headless bisa macet pada permission prompt | Pi memakai `--print --approve` setelah approval dispatch; monitor log/progres |
| Build lokal dan CI bisa mengulang pekerjaan yang sama | Build lokal berdasarkan risiko/trigger; artifact deploy tetap wajib lolos CI |

Prosedur produksi dan detail sensitif **tidak** dipindahkan ke dokumen ini. Tetap gunakan
`docs/ops/vps.md` lokal; bila tidak tersedia, minta detail dari user.
