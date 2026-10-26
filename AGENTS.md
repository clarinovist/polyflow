# Workflow Rules

**Verifikasi mengikuti risiko, bukan jumlah file/baris. Kurangi administrasi, bukan perlindungan data.**
File ini sumber kebijakan workflow; panduan modul hanya menambah invariant domain.

**Izin pengguna:** commit lokal dulu; push/deploy perlu izin eksplisit untuk scope yang disetujui. Izin push bukan izin deploy; bila push memicu auto-deploy, izin deploy harus ada sebelum push. SSH read-only untuk diagnosis dalam scope tetap diizinkan setelah target terverifikasi; akses SSH/root/sudo bukan izin deploy atau tulis data. Jaga WIP/secret dan gate rilis; bukan izin force-push, penghapusan data, atau operasi di luar scope. Jika tersedia, baca kebijakan workspace `../AGENTS.md`.

Navigasi kode: `.agents/AGENTS.md` → `AGENTS.md` area terkait. Baca bagian relevan dari
`docs/development/agent-workflow-reference.md` hanya saat trigger-nya berlaku: diagnosis coverage,
delegasi, hooks, runtime/container, recovery/arsip, atau commit dengan index campuran.

## Alur kerja: pahami → perbaiki → review & verifikasi → laporkan

1. **Pahami:** cek `git status --short`, lindungi WIP, lalu sebut jalur + alasan + acceptance criteria + verifikasi secara singkat sebelum edit. Investigasi bila dampak belum jelas.
2. **Perbaiki:** kerjakan scope yang disepakati. Ringan dan Normal kecil cukup rencana di chat; file plan wajib sebelum fix untuk Kritis, delegasi, atau pekerjaan panjang/multitahap yang perlu handoff. Gunakan `docs/plan/YYYY-MM-DD-<slug>.md`; Kritis memakai bagian relevan `_TEMPLATE.md` secara ringkas; invariant, verifikasi, dan failure path/rollback tetap wajib. Plan rutin lokal/gitignored, jangan stage. Naikkan jalur dan perbarui rencana jika risiko bertambah.
3. **Review & verifikasi:** periksa diff aktual terhadap acceptance criteria, regresi, dan guardrail; selesaikan blocker sebelum commit. Tidak perlu hitungan/checklist “Residual Gap” terpisah. Temuan di luar scope menjadi follow-up kecuali memengaruhi keamanan/kebenaran patch. Gate gagal → fix → review ulang dan ulangi pemeriksaan terdampak.
4. **Laporkan:** ringkas perubahan, jalur, pemeriksaan lolos/gagal/tidak dijalankan beserta alasan, serta cleanup. Gate berat yang terhalang environment lokal dipindahkan ke CI/remote test terisolasi; push/dispatch release hanya setelah izin masing-masing diberikan; jangan mengklaim lolos atau deploy sebelum gate rilis sukses.

## Eksekusi proporsional — jalur terpendek yang aman

- Utamakan alur aplikasi/runbook/tooling yang sudah tersedia dan sesuai makna bisnis. Jangan membuat skrip koreksi, abstraksi, atau infrastruktur baru sebelum membuktikan jalur existing tidak mencukupi; jangan memakai transaksi yang salah makna hanya agar angka cocok.
- Investigasi cukup ketika penyebab atau kondisi awal, target, jalur tindakan, dan invariant sudah terbukti. Baca referensi/caller yang relevan saja; perluas hanya untuk pertanyaan yang belum terjawab dan memengaruhi keputusan. Jangan mengulang penelusuran tanpa bukti baru.
- Plan Kritis kecil cukup satu catatan lokal: scope/target, bukti awal → hasil yang diharapkan, langkah, invariant, verifikasi, dan recovery. Untuk koreksi data, sertakan backup serta pencegahan eksekusi ganda. Tidak perlu menyalin semua bagian template atau membuat laporan pendamping.
- **Operasi data melalui alur rilis yang tidak berubah tetap Kritis, tetapi bukan rilis kode baru.** Jika source/tooling, dependency, schema, runtime/config tidak berubah, gunakan bukti gate rilis pada artifact yang sama serta uji domain relevan yang masih berlaku; tidak perlu full coverage/build ulang. Bukti kurang atau input berubah → jalankan gate terdampak. Skrip baru tidak otomatis tercakup bukti service lama; review dan uji jalur eksekusinya di lingkungan terisolasi sebelum mutasi produksi. Perubahan kode/schema/runtime tetap mengikuti gate Kritis dan rilis di bawah.
- Koreksi data tetap wajib: target/otorisasi terverifikasi, backup yang dapat dipulihkan, preview/dry-run, transaksi atomic + audit, pencegahan duplikasi, pencocokan hasil dengan invariant, dan rollback/recovery. Jangan mengedit saldo langsung atau menghapus riwayat untuk melewati service/guard. Produksi bukan tempat test.
- Gunakan hasil uji identik dan environment terisolasi yang sudah tersedia. Buat environment baru hanya jika ada pemeriksaan wajib yang belum tercakup dan tidak bisa dijalankan di environment tersebut. Jika pekerjaan melebar, jelaskan blocker spesifik dan langkah berikutnya; jangan menambah prosedur hanya karena label Kritis.

## Matriks verifikasi — lokal ringan, gate berat di CI

| Jalur | Kriteria | Verifikasi |
| --- | --- | --- |
| **Ringan** | Dokumentasi, typo, styling lokal tanpa perubahan perilaku, akses, data, atau kontrak | Review diff + pemeriksaan relevan. Docs: link/guard; UI: lint file berubah + visual. Test/typecheck bila terdampak; full coverage/build tidak wajib. |
| **Normal** | Bug logika terbatas, komponen, API nonkritis dengan dampak dipahami | Lint/typecheck terjangkau + regression/scoped test lokal; full coverage/build di CI. |
| **Kritis** | HPP, stok, jurnal, pembayaran/payroll, auth/permission, isolasi tenant, transaksi/audit kritis, schema/migration/data patch, dependency/runtime, konfigurasi build/deploy | Review + scoped test lokal yang terjangkau; lint, full coverage, typecheck, build, dan verifikasi domain/migration wajib sebelum rilis, utamakan CI/remote test terisolasi. |

- Satu baris filter tenant tetap Kritis. Label keuangan murni tampilan bisa Ringan; perubahan rumus, satuan, atau makna operasional bukan typo. Interaksi/alur/akses UI minimal Normal. Refactor shared/cross-module minimal Normal: petakan caller, naikkan ke Kritis jika menyentuh invariant kritis.
- Bug logika perlu regression test yang mengeksekusi perubahan. Test di `src/**/__tests__/` bernama `*.test.ts`, `*.test.tsx`, atau `*.spec.ts`; contoh: `npm run test -- <path-atau-filter>`. Service/action/lib baru ≥100 baris wajib happy path + branch utama.
- **Full coverage** (`npm run test:coverage`) dan **build produksi** (`npm run build`) diutamakan di CI, termasuk Kritis, perubahan shared/routing/runtime, dan diagnosis kegagalan CI. Gunakan log/artifact CI dan scoped test untuk iterasi; tidak wajib menjalankan ulang gate berat lokal sebelum commit/push.
- Normal/Kritis: lint dan typecheck harus 0 error, termasuk test. Threshold coverage **71/63/75/72** (Stmts/Branch/Funcs/Lines), target 80%, tetap dijaga CI. Jangan turunkan threshold, exclude production service demi ratio, melewati guard, atau menurunkan jalur agar cepat/hijau.
- Jangan ulang scoped suite yang sudah tercakup full coverage. Pemeriksaan independen boleh paralel jika resource aman. Gunakan ulang hasil terverifikasi hanya bila input relevan (source/dependency/config/environment) identik; patch lanjutan mengulang gate terdampak, lebih luas bila dampaknya tidak jelas.

## Environment: lokal ringan, CI/CD dulu untuk pekerjaan berat

- Gunakan tooling lokal yang tersedia untuk pemeriksaan ringan. **Kritis tidak otomatis berarti Docker.** Full suite/coverage, integration/E2E, build produksi, dan image build diutamakan di CI.
- Jangan otomatis menyalakan Docker, membuat container/Compose stack, atau menarik/build image lokal. Jika DB/runtime khusus diperlukan, gunakan CI service container atau remote test terisolasi yang sudah tersedia. Docker lokal hanya untuk reproduksi yang benar-benar membutuhkan lokal dan resource memadai; jelaskan kebutuhan, batasi resource, lalu bersihkan resource tugas sendiri.
- Jangan gunakan database produksi untuk test. Test yang membutuhkan DB nyata tidak boleh diganti mock hanya demi cepat. Environment lokal tidak tersedia bukan alasan melewati izin push: setelah diizinkan, jalankan verifikasi di CI/remote terisolasi, pertahankan gate sebelum deploy, dan laporkan hasil yang belum ada secara jujur.
- Terminal lain aktif bukan otomatis blocker: cek konflik `.next`, workspace, lock, resource/RAM, dan proses DB. Bila konflik, tunggu/koordinasikan isolasi; jangan menghentikan proses sesi lain tanpa izin.

## Workspace & cleanup

- Satu writer per file; pekerjaan paralel overlap memakai worktree terpisah. Jangan menimpa/revert WIP sesi lain. Setelah edit 5+ file atau rewrite component, cek status + `git diff --stat` dan review diff aktual.
- Setelah review, stage hanya scope/hunk sendiri sebagai checkpoint, bukan bukti verifikasi. Jika perubahan hilang, bandingkan diff/index/backup dulu; jangan menulis ulang versi lama secara buta.
- **Selalu rapikan milik tugas sendiri:** cek status/artefak sebelum laporan akhir, hapus sementara/duplikat yang tak diperlukan dan hentikan hanya proses tugas sendiri yang sudah selesai; pastikan resource tidak sedang dipakai sesi lain.
- Pertahankan source, test, docs, `.env`, dependensi lokal, data bisnis, image aktif, skrip recovery, backup yang diperlukan, dan bukti test/rilis. Jangan hapus massal atau Docker prune, mengubah produksi/retensi/backup, atau commit/push hanya demi bersih. Arsip khusus mengikuti referensi; laporkan yang sengaja disimpan/ditunda tanpa dokumen cleanup tambahan.

## Batas keamanan & rilis

- Jaga isolasi tenant, permission, invariant keuangan/stok, dan transaksi atomic. Operasi kritis (cancel/confirm/ship) wajib manual `logActivity` di dalam transaction; audit otomatis memakai outer client. Saat menyentuh status/audit, baca `src/lib/AGENTS.md` dan bagian audit di referensi.
- Setiap perubahan `prisma/schema.prisma` wajib SQL migration di `prisma/migrations/YYYYMMDD_name/migration.sql`; `prisma generate` saja tidak cukup. Review SQL untuk multi-tenant dan tabel kosong, bukan mengasumsikan satu DB.
- Jangan commit secret, credential, data pelanggan, nama tenant/host, atau topologi; simpan privat di `docs/plan/` atau `docs/ops/` (gitignored). Jangan kirim data sensitif ke prompt/log worker; repo private bukan pengecualian.
- Aktifkan hooks sekali per clone: `git config core.hooksPath .githooks`. Pertahankan guard AGENTS, data-file, dan tenant-name; baca referensi saat setup/guard terblokir (sidecar lokal wajib agar guard tenant-name aktif).
- `.nvmrc` dan base Node `Dockerfile` harus sama; CI memakai `node-version-file: '.nvmrc'`. Perubahan runtime mengikuti referensi dan `bash scripts/check-node-version.sh`.
- Commit setelah review acceptance criteria/guardrail dan pemeriksaan lokal yang terjangkau; gate berat berjalan di Push CI dan menerbitkan artifact release immutable. Release terjadwal atau `workflow_dispatch` hanya boleh mengonsumsi artifact exact run/SHA yang seluruh gatenya lolos. Stage/commit scope sendiri, bukan seluruh index; file campuran harus dipisahkan dulu. Sebut plan pada pesan commit bila ada; detail pathspec ada di referensi.
- **Commit lokal dulu; push dan deploy masing-masing perlu izin eksplisit.** Push ke `main` dapat memasok artifact ke release terjadwal; sebelum push, periksa apakah jadwal atau trigger akan merilis artifact itu. Dapatkan izin deploy juga bila push akan berujung deploy otomatis, atau gunakan jalur verifikasi non-deploy yang tersedia tanpa mengubah pipeline diam-diam. Setelah operasi diizinkan, verifikasi target, backup, serta rollback; seeding/data patch atau perubahan credential/akses memerlukan scope spesifik.
- **CI tidak dikurangi:** artifact commit SHA yang dideploy wajib lolos full coverage, lint/typecheck/JEV, kedua contract PostgreSQL, worker smoke, Nginx, serta build-and-push di `.github/workflows/ci.yml`. Push CI menerbitkan manifest SHA/run-attempt/digest immutable; `.github/workflows/production.yml` hanya memverifikasi bukti tersebut lalu migrate/deploy. Build produksi di CI → registry → VPS pull/restart; **jangan build di VPS**.
- Sebelum deploy/operasi produksi, baca `docs/ops/vps.md` lokal; jika tidak ada, cari runbook/inventaris tepercaya atau konfigurasi SSH yang tersedia. Minta hanya detail target yang benar-benar belum terverifikasi, bukan izin SSH ulang; jangan menebak. Pascadeploy: health/log + smoke test; perubahan schema/data juga wajib verifikasi migration dan invariant/isi tabel tenant target. CI green bukan bukti data benar.
- Debug DB produksi wajib read-only (`SET TRANSACTION READ ONLY` / user read-only); tulis langsung ke DB prod hanya lewat alur rilis/migration. Satu key SSH per perangkat; key tak terpakai dihapus dari `authorized_keys`. Detail pola di `docs/ops/vps.md` (lokal).

## Delegasi (opsional)

- Dalam Hermes, kerjakan langsung di sesi yang sama; worker/reviewer tambahan memerlukan persetujuan runner/model/scope/biaya dan akses terverifikasi. Jangan otomatis mengganti CLI/model atau mengaktifkan delegasi bawaan. CommandCode tidak aktif: jangan otomatis menjalankan CLI/API, login, atau smoke-test.
- Review sendiri adalah self-review, bukan review independen. Tetap periksa diff dan bukti gate yang relevan.
- Edit kecil kerjakan langsung. Setiap dispatch perlu approval eksplisit, file plan, dan scope ownership terbatas; baca prosedur worker di referensi sebelum dispatch. Gunakan Pi, bukan OpenCode.
- Default warisi model sesi. Worker code/migration/test minimum tier Sonnet; Haiku hanya task mekanis bounded. Jangan menurunkan tier demi biaya atau mengganti model tanpa alasan.
- Orchestrator review diff aktual dan bukti verifikasi worker; gunakan hasil identik tanpa mengulang suite. Scope melenceng/overlap → hentikan dan review, jangan revert sesi lain. Operasi produksi, credential, commit/push/deploy dikoordinasikan orchestrator memakai izin tetap di atas; worker tetap mengikuti scope delegasi.

## Codemode — khusus Pi

Resep berikut hanya berlaku di Pi dengan `codemode` tersedia. Di Hermes gunakan tool yang tersedia pada sesi aktif, bukan memasang Pi atau menebak nama tool. Prinsip file-backed, urutan mutasi, exit status, dan perlindungan data tetap berlaku di semua runner.

- Gunakan `codemode` secara adaptif: dua atau lebih call independen, loop/filter/agregasi, output besar yang perlu diringkas, atau chaining sederhana. Untuk satu `read`/`bash`/`edit`/`write` trivial, panggil tool langsung.
- Skrip adalah JavaScript mentah (bukan JSON/fence), dijalankan sebagai body async di sandbox QuickJS: top-level `await`/`return` bisa; tanpa Node/fs/network/timer. Dunia luar hanya via `tools.*` dan `models`. Skrip tidak bisa memanggil `codemode` lain dari dalam.
- Payload heredoc, SQL multi-statement, Markdown/code fence, SSH→DB, atau nested quoting wajib file-backed: `write` file → `read`/inspect → `bash` menjalankan file. Jangan menanam payload itu sebagai string codemode inline. Setelah satu parse failure, beralih ke direct/file-backed; jangan retry inline kompleks.
- Panggil tool sebagai `await tools.<nama>({...})` (karakter non-identifier jadi `_`). Call gagal/diblokir/argumen invalid me-reject sebagai `Error` — pakai `Promise.allSettled()` agar hasil yang sukses tetap kepakai. Call yang masih jalan saat skrip selesai dibatalkan; promise tanpa `await` dibuang. Tool call bersifat nyata: yang sudah jalan sebelum skrip gagal tidak di-undo.
- Periksa setiap hasil `bash`: `exit_code`, `truncated`, dan `full_output_path`. Gunakan helper fail-fast hanya jika nonzero tidak diharapkan; untuk expected-nonzero nyatakan kode yang diizinkan. Hindari pipeline atau `; echo $?` yang menutupi exit command utama.
- Call bergantung dan mutasi harus berurutan, misalnya backup → dry-run/precheck → apply → verifikasi read-only. Hanya call independen yang boleh diparalelkan.
- Opsi baris pertama bila perlu: `// @options: {"max_output_tokens": 2000, "timeout_ms": 60000}`. `timeout_ms` adalah deadline keras seluruh skrip (default unset); jangan set pendek untuk generate image yang bisa makan waktu menit.
- `store(key, value)` / `load(key)` hanya untuk state JSON kecil antar-call (ID, cursor, ringkasan; maks 256 KiB/nilai, 1 MiB total; hanya tersimpan bila skrip sukses). Jangan simpan data image; tampilkan via `image()` atau tulis ke file via tool.
- `models` hanya untuk non-LLM via kredensial sesi: `classify()` (choice/score/bool, cek `stopReason`/`errorMessage`, maks 4 concurrent) dan `generateImages()` (tampilkan blok via `image()`, jangan print base64 sebagai teks). Chat model terdaftar tapi tidak bisa dijalankan dari skrip. Cari ID yang valid via `models.getAvailableOfType(type)`.
- Batas VM 256 MB — filter/agregasi di dalam skrip, jangan akumulasi data besar. Tanpa timer: jangan `await` promise yang tak pernah settle tanpa pending tool call.
- JEV tetap via `mcpScript` + `await jev.evaluate(...)` sesuai skill `jev`, bukan via `codemode`. Kebijakan data/sensitif dan provenance JEV tetap berlaku.
- Personal quality guard memberi syntax preflight, memblokir inline payload kompleks, dan menambahkan diagnostic `parse_error`, `tool_rejection`, `shell_exit`, `timeout`, `stalled`, `output_limit`, `sandbox_error`, atau `script_error`. Resep dan helper canonical ada di `~/.pi/agent/docs/codemode-playbook.md`; eval ada di `~/.pi/agent/codemode-quality/tests/`.
- Pola ops-data: jalankan alur backup → dry-run/precheck → mutasi → verifikasi secara berurutan dan file-backed bila memakai SSH/DB/heredoc; tampilkan hanya ringkasan nonsensitif. Detail tenant tetap di `docs/plan/` (lokal, gitignored).

## graphify

- Saat user mengetik `/graphify`, baca skill/instruksi terpasang terlebih dahulu.
- Untuk pertanyaan codebase, jika `graphify-out/graph.json` ada, awali dengan `graphify query "<question>"`; gunakan `graphify path "<A>" "<B>"` untuk relasi atau `graphify explain "<concept>"` untuk konsep terfokus. Dirty graph bukan alasan skip; pengecualian hanya perbaikan graph stale/salah atau user meminta skip.
- Gunakan `graphify-out/wiki/index.md` untuk navigasi luas bila ada. Baca `GRAPH_REPORT.md` hanya untuk review arsitektur luas atau hasil query/path/explain belum cukup.
- Setelah patch kode final, jalankan `graphify update .` sekali (AST-only, tanpa biaya API). Docs-only tidak perlu update.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
