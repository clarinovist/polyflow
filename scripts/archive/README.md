# scripts/archive

Skrip **sekali pakai yang sudah dieksekusi**. Disimpan sebagai jejak audit, bukan
sebagai alat yang masih dipakai.

## Jangan jalankan ulang

Sebagian besar berkas di sini melakukan salah satu dari:

- menulis perbaikan data untuk satu entitas yang di-hardcode (satu work order, satu
  invoice, satu periode) — menjalankannya lagi akan menyentuh data yang salah, atau
  menggandakan koreksi yang sudah masuk;
- menambal bug yang perbaikan permanennya sudah ada di kode aplikasi — jadi
  skripnya sudah tidak relevan;
- mereset data transaksional per tenant — destruktif.

Untuk sistem akuntansi, "skrip apa yang pernah menyentuh angka ini" adalah pertanyaan
audit yang wajar muncul berbulan-bulan kemudian. Itu alasan direktori ini ada, dan
alasan isinya tidak dihapus meski sudah mati.

## Bukan bagian dari build

Direktori ini inert secara teknis, dan itu memang disengaja:

| Aspek               | Status                                                                       |
| ------------------- | ---------------------------------------------------------------------------- |
| `tsconfig.json`     | `exclude: scripts/**/*.ts` — tidak ikut type-check                           |
| `eslint.config.mjs` | `globalIgnores: scripts/**` — tidak ikut lint                                |
| `package.json`      | tidak ada script yang memanggil direktori ini                                |
| CI (`.github/`)     | tidak dirujuk                                                                |
| `Dockerfile`        | hanya menyalin `scripts/*.js` (top level) — arsip tidak masuk image produksi |

## Kalau mau mengarsipkan skrip baru

1. Pastikan tidak ada yang merujuknya: `grep -rn "<nama-file>" --exclude-dir=node_modules .`
2. `git mv scripts/<nama-file> scripts/archive/`
3. Perbarui path di komentar header berkas itu, dan tambahkan catatan `ARCHIVED:`
   yang menjelaskan apa yang menggantikannya.
4. Perbaiki dokumen mana pun yang menunjuk path lamanya — ini bagian yang paling
   sering terlewat, dan yang membuat skrip mati terlihat masih hidup.

## Yang TIDAK boleh masuk sini

Berkas non-skrip: log, `.bak`, dump, dataset. Semuanya tidak punya nilai audit dan
sudah pernah menumpuk di sini. Kalau butuh disimpan, taruh di tempat yang semestinya
atau masukkan `.gitignore`.

## Diagnostik yang masih hidup

Alat generik yang bisa dijalankan kapan saja (tanpa hardcode entitas) tempatnya di
`scripts/`, **bukan** di sini. Contoh: `scripts/check-ob.js` — dirujuk oleh
`src/actions/finance/AGENTS.md` untuk mendiagnosis selisih saldo awal.
