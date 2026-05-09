# Read-only PolyFlow VPS Check Plan

> Untuk sesi ini: hanya verifikasi read-only. Tidak ada perubahan data, restart service, atau eksekusi script seed/migrasi.

Tujuan:
- Memastikan environment VPS PolyFlow sehat dan target database yang akan dibahas benar.
- Memvalidasi mapping tenant ke database sebelum masuk ke pembahasan atau query lebih jauh.

Ruang lingkup:
1. Cek status container PolyFlow (`polyflow-app`, `polyflow-db`) di VPS.
2. Cek daftar database PostgreSQL yang tersedia.
3. Cek data tenant pada main database untuk melihat subdomain dan `databaseUrl`.
4. Rangkum hasil untuk menentukan target kerja berikutnya.

Perintah yang akan dipakai (read-only):
- `ssh nugrohopramono "docker compose -f /root/polyflow/docker-compose.yml ps"`
- `ssh nugrohopramono "docker exec -i polyflow-db psql -U polyflow -d polyflow -At -c \"SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;\""`
- `ssh nugrohopramono "docker exec -i polyflow-db psql -U polyflow -d polyflow -P pager=off -c \"SELECT id, name, subdomain, \\\"databaseUrl\\\" FROM \\\"Tenant\\\" ORDER BY subdomain;\""`

Kriteria sukses:
- Container status terbaca.
- Database utama dan tenant DB terlihat.
- Mapping tenant -> database terverifikasi.
- Bisa memastikan apakah `melindo_rafia` memang target yang benar untuk langkah berikutnya.

Catatan safety:
- Tidak menjalankan `seed.js`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, atau restart service.
- Semua command melalui SSH non-interactive.
