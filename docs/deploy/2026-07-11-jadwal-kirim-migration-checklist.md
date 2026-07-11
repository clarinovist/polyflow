# Migration Checklist — Jadwal Kirim Planning Trip Model

**Date:** 2026-07-11
**Migration:** `20260711_jadwal_kirim_planning_trip`

## Pre-Migration

- [ ] Backup semua tenant DB sebelum migrate
- [ ] Pastikan Docker polyflow-app + polyflow-db running
- [ ] Pastikan branch `main` sudah ter-deploy (CI/CD pipeline selesai)

## Step 1: Enum Expansion (PER TENANT — MANUAL, OUTSIDE TRANSACTION)

`ALTER TYPE ... ADD VALUE` tidak bisa dijalankan dalam transaksi. Harus dijalankan PER TENAN via psql SEBELUM `prisma migrate deploy`.

```bash
# Kiyowo
docker exec polyflow-db psql -U polyflow -d polyflow -c "ALTER TYPE \"ScheduleStatus\" ADD VALUE IF NOT EXISTS 'ACTIVE'; ALTER TYPE \"ScheduleStatus\" ADD VALUE IF NOT EXISTS 'CLOSED';"

# Melindo
docker exec polyflow-db psql -U polyflow -d melindo_rafia -c "ALTER TYPE \"ScheduleStatus\" ADD VALUE IF NOT EXISTS 'ACTIVE'; ALTER TYPE \"ScheduleStatus\" ADD VALUE IF NOT EXISTS 'CLOSED';"

# polyflow_ref (jika ada)
docker exec polyflow-db psql -U polyflow -d polyflow_ref -c "ALTER TYPE \"ScheduleStatus\" ADD VALUE IF NOT EXISTS 'ACTIVE'; ALTER TYPE \"ScheduleStatus\" ADD VALUE IF NOT EXISTS 'CLOSED';"
```

**Verifikasi:**
```bash
docker exec polyflow-db psql -U polyflow -d polyflow -c "SELECT enum_range(NULL::\"ScheduleStatus\");"
# Harus return: {DRAFT,CONFIRMED,IN_TRANSIT,COMPLETED,ACTIVE,CLOSED}
```

## Step 2: Drop Unique Indexes (if prisma migrate deploy skipped them)

Prisma `@@unique` generates UNIQUE INDEX (not CONSTRAINT). Migration SQL uses
`DROP CONSTRAINT IF EXISTS` which silently skips these. Manual drop required:

```bash
# Kiyowo
docker exec polyflow-db psql -U polyflow -d polyflow -c 'DROP INDEX IF EXISTS "DeliveryScheduleVehicle_scheduleId_vehicleId_key";'
docker exec polyflow-db psql -U polyflow -d polyflow -c 'DROP INDEX IF EXISTS "DeliveryScheduleOrder_scheduleVehicleId_deliveryOrderId_key";'

# Melindo
docker exec polyflow-db psql -U polyflow -d melindo_rafia -c 'DROP INDEX IF EXISTS "DeliveryScheduleVehicle_scheduleId_vehicleId_key";'
docker exec polyflow-db psql -U polyflow -d melindo_rafia -c 'DROP INDEX IF EXISTS "DeliveryScheduleOrder_scheduleVehicleId_deliveryOrderId_key";'
```

## Step 3: Prisma Migrate Deploy

```bash
docker exec polyflow-app npx prisma@5.22.0 migrate deploy
```

Migration `20260711_jadwal_kirim_planning_trip` akan:
- Create enums `TripStatus`, `ScheduleStopStatus`
- Alter `DeliveryScheduleVehicle`: +routeName, +status, +sequence, +updatedAt
- Backfill trip status dari parent schedule
- Drop unique constraint `(scheduleId, vehicleId)`
- Alter `DeliveryScheduleOrder`: +salesOrderId, +plannedWeightKg, +sequence, +status, +notes, +updatedAt, +updatedAt
- Backfill salesOrderId dari DeliveryOrder
- Drop unique constraint `(scheduleVehicleId, deliveryOrderId)`
- Make deliveryOrderId nullable
- Add FK + indexes

**Verifikasi:**
```bash
docker exec polyflow-db psql -U polyflow -d polyflow -c "\d \"DeliveryScheduleVehicle\""
# Harus ada: routeName, status, sequence, updatedAt

docker exec polyflow-db psql -U polyflow -d polyflow -c "\d \"DeliveryScheduleOrder\""
# Harus ada: salesOrderId, plannedWeightKg, sequence, status, notes, updatedAt

docker exec polyflow-db psql -U polyflow -d polyflow -c "SELECT COUNT(*) FROM \"DeliveryScheduleOrder\" WHERE \"salesOrderId\" IS NOT NULL;"
# Harus > 0 (backfilled dari DO existing)
```

## Step 3: Smoke Test

- [ ] Buka `/sales/delivery-schedules` — list load tanpa error
- [ ] Buka detail jadwal existing — trip + stop tampil
- [ ] Buat jadwal baru → tambah trip dengan departureDate → assign SO → generate SJ
- [ ] Cek DO muncul di `/sales/deliveries` dengan vehicle + pricing benar
- [ ] Legacy jadwal (CONFIRMED/IN_TRANSIT) tampil dengan badge "Aktif"

## Rollback Plan

Jika migration gagal:

```bash
# 1. Restore DB dari backup
# 2. Atau manual rollback:
docker exec polyflow-db psql -U polyflow -d polyflow -c "
  DROP TABLE IF EXISTS \"DeliveryScheduleOrder\";
  DROP TABLE IF EXISTS \"DeliveryScheduleVehicle\";
  DROP TYPE IF EXISTS \"ScheduleStopStatus\";
  DROP TYPE IF EXISTS \"TripStatus\";
  ALTER TYPE \"ScheduleStatus\" DROP VALUE IF EXISTS 'ACTIVE';
  ALTER TYPE \"ScheduleStatus\" DROP VALUE IF EXISTS 'CLOSED';
"
```

**Note:** Rollback akan menghapus data schedule baru. Data existing (sebelum migration) tidak terpengaruh karena schema lama masih compatible.

## Post-Migration

- [ ] Deploy aplikasi baru (CI/CD)
- [ ] Verify semua tenant bisa akses halaman jadwal
- [ ] Monitor error logs 24 jam pertama
