import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { tenantContext } from '@/lib/core/prisma';
import { returnTestClient, verifyReturnTestDatabase } from '../../finance/__tests__/return-credit-postgres-fixture';
import { finishTripMileage, saveRouteDistance, saveTripDistancePlan, startTripMileage } from '../trip-distance-service';
import { fleetMonth } from '@/lib/sales/fleet-summary';
import { getFleetDistanceHistory, getFleetSummaries } from '../fleet-summary-service';
import { correctVehicleMileage, finishVehicleMileage, startVehicleMileage } from '../vehicle-mileage-service';
const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = connection ? returnTestClient(connection) : null;
const otherUrl = connection ? new URL(connection) : null;
if (otherUrl) otherUrl.pathname = '/polyflow_return_credit_tenant_test';
const other = otherUrl ? returnTestClient(otherUrl.toString()) : null;
const run = <T>(fn: () => Promise<T>) => tenantContext.run(db!, fn);
async function seed(client: PrismaClient) {
    await verifyReturnTestDatabase(client);
    await client.$executeRaw`TRUNCATE "VehicleTripMileage", "DeliveryRouteDistance", "DeliverySchedule", "Vehicle", "User", "AuditLog" CASCADE`;
    await client.user.create({ data: { id: 'km-user', email: 'km@example.invalid', password: 'synthetic-only', role: 'SALES' } });
    await client.vehicle.create({ data: { id: 'v', plateNumber: 'SYNTHETIC-KM', name: 'Factory vehicle', ownershipType: 'FACTORY' } });
    await client.deliverySchedule.create({ data: { id: 's', scheduleNumber: 'SYNTHETIC-KM', weekStart: new Date('2026-09-21'), weekEnd: new Date('2026-09-27') } });
    await client.deliveryScheduleVehicle.createMany({ data: ['t1', 't2'].map((id) => ({ id, scheduleId: 's', vehicleId: 'v', status: 'DEPARTED', transportMode: 'INTERNAL_FLEET', departureDate: new Date('2026-09-23') })) });
}
const start = (tripId = 't1', odometerStart = 100) => run(() => startTripMileage({ tripId, odometerStart, driverName: 'Synthetic Driver' }, 'km-user'));
const finish = (tripId = 't1', odometerEnd = 184) => run(() => finishTripMileage({ tripId, odometerEnd }, 'km-user'));
const startLog = (odometerStart = 100, driverName = 'Synthetic Driver') => run(() => startVehicleMileage({ vehicleId: 'v', odometerStart, driverName, note: 'synthetic note' }, 'km-user'));
const finishLog = (mileageId: string, odometerEnd = 150) => run(() => finishVehicleMileage({ mileageId, odometerEnd }, 'km-user'));
describe.skipIf(!db)('factory mileage PostgreSQL contracts', () => {
    beforeEach(async () => seed(db!));
    afterAll(async () => { await Promise.all([db?.$disconnect(), other?.$disconnect()]); });
    it('rejects calls without tenant context without falling back to main database', async () => {
        await expect(startTripMileage({ tripId: 't1', odometerStart: 100, driverName: 'D' }, 'km-user')).rejects.toThrow('Konteks tenant');
        expect(await db!.vehicleTripMileage.count()).toBe(0);
    });
    it('serializes duplicate start/finish and records km once with atomic audit', async () => {
        const stockBefore = await db!.stockMovement.count();
        await Promise.all([start(), start()]);
        expect(await db!.vehicleTripMileage.count()).toBe(1);
        expect(await db!.auditLog.count({ where: { action: 'START_TRIP_MILEAGE' } })).toBe(1);
        await Promise.all([finish(), finish()]);
        const record = await db!.vehicleTripMileage.findUniqueOrThrow({ where: { tripId: 't1' } });
        expect(Number(record.odometerEnd) - Number(record.odometerStart)).toBe(84);
        expect(await db!.auditLog.count({ where: { action: 'FINISH_TRIP_MILEAGE' } })).toBe(1);
        expect(await db!.stockMovement.count()).toBe(stockBefore);
    });
    it('prevents competing trips on one vehicle and backwards odometer ranges', async () => {
        const outcomes = await Promise.allSettled([start('t1'), start('t2')]);
        expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
        const record = await db!.vehicleTripMileage.findFirstOrThrow();
        await finish(record.tripId!);
        const next = record.tripId === 't1' ? 't2' : 't1';
        await expect(start(next, 183)).rejects.toThrow('di bawah');
        await start(next, 184);
        await expect(finish(next, 183)).rejects.toThrow('lebih kecil');
    });
    it('rolls back business writes when audit FK fails and preserves history FKs', async () => {
        await expect(run(() => startTripMileage({ tripId: 't1', driverName: 'D', odometerStart: 100 }, 'missing-actor'))).rejects.toThrow();
        expect(await db!.vehicleTripMileage.count()).toBe(0);
        await start();
        await expect(db!.deliveryScheduleVehicle.delete({ where: { id: 't1' } })).rejects.toMatchObject({ code: 'P2003' });
        await expect(db!.vehicleTripMileage.update({ where: { tripId: 't1' }, data: { odometerEnd: 99, returnedAt: new Date() } })).rejects.toThrow();
        await expect(db!.deliveryScheduleVehicle.update({ where: { id: 't1' }, data: { status: 'PLANNED' } })).rejects.toThrow('odometer');
        await expect(db!.deliveryScheduleVehicle.update({ where: { id: 't1' }, data: { vehicleId: null } })).rejects.toThrow('odometer');
    });
    it('keeps ordered route snapshots unchanged when master price-free distance changes', async () => {
        await db!.deliveryScheduleVehicle.update({ where: { id: 't1' }, data: { status: 'PLANNED' } });
        const a = await run(() => saveRouteDistance({ originAddress: 'Factory', destinationAddress: 'A', distanceKm: 40 }, 'km-user'));
        const b = await run(() => saveRouteDistance({ originAddress: 'A', destinationAddress: 'Factory', distanceKm: 44 }, 'km-user'));
        await run(() => saveTripDistancePlan({ tripId: 't1', routeIds: [a.id, b.id] }, 'km-user'));
        await run(() => saveRouteDistance({ originAddress: 'Factory', destinationAddress: 'A', distanceKm: 42 }, 'km-user'));
        const trip = await db!.deliveryScheduleVehicle.findUniqueOrThrow({ where: { id: 't1' } });
        expect(Number(trip.plannedDistanceKm)).toBe(84);
        expect(trip.distanceLegs).toMatchObject([{ distanceKm: 40 }, { distanceKm: 44 }]);
        await expect(run(() => saveTripDistancePlan({ tripId: 't1', routeIds: [a.id, a.id] }, 'km-user'))).rejects.toThrow('tersambung');
        expect(await db!.auditLog.count({ where: { action: 'PLAN_TRIP_DISTANCE' } })).toBe(1);
    });
    it('isolates writes and reads by actual tenant client even with matching trip ids', async () => {
        await seed(other!);
        await start();
        expect(await other!.vehicleTripMileage.count()).toBe(0);
        await tenantContext.run(other!, () => startTripMileage({ tripId: 't1', driverName: 'Other', odometerStart: 500 }, 'km-user'));
        expect(Number((await db!.vehicleTripMileage.findFirstOrThrow()).odometerStart)).toBe(100);
        expect(Number((await other!.vehicleTripMileage.findFirstOrThrow()).odometerStart)).toBe(500);
    });
    it('reads fleet summaries and history from only the active tenant with exact month/legacy coverage', async () => {
        await seed(other!);
        await start();
        await finish();
        await db!.deliveryScheduleVehicle.create({ data: { id: 'legacy', scheduleId: 's', vehicleId: 'v', status: 'COMPLETED', departureDate: null } });
        await db!.deliveryScheduleVehicle.create({ data: { id: 'outside', scheduleId: 's', vehicleId: 'v', status: 'COMPLETED', departureDate: new Date('2026-08-31T16:59:59Z') } });
        const [summary] = await run(() => getFleetSummaries(['v'], '2026-09'));
        expect(summary).toMatchObject({ actualKm: 84, recordedTrips: 1, pendingTrips: 1, undatedTrips: 1, latestReading: { km: 184, source: 'TRIP_RETURN' } });
        const history = await run(() => getFleetDistanceHistory('v', '2026-09'));
        expect(history.rows.map((row) => row.id).sort()).toEqual(['legacy', 't1', 't2']);
        expect(history.actualKm).toBe(summary.actualKm);
        const [otherSummary] = await tenantContext.run(other!, () => getFleetSummaries(['v'], '2026-09'));
        expect(otherSummary).toMatchObject({ actualKm: null, recordedTrips: 0, pendingTrips: 2, latestReading: null });
    });
    it('allows records without a trip, enforces one open record per vehicle and keeps the chain monotonic', async () => {
        const first = await startLog();
        expect(await db!.vehicleTripMileage.findUniqueOrThrow({ where: { id: first.mileageId } })).toMatchObject({ tripId: null, note: 'synthetic note' });
        const outcomes = await Promise.allSettled([startLog(100), startLog(100)]);
        expect(outcomes.every((outcome) => outcome.status === 'rejected')).toBe(true);
        await expect(db!.vehicleTripMileage.create({ data: { vehicleId: 'v', driverName: 'Raw', odometerStart: 100 } })).rejects.toThrow();
        await finishLog(first.mileageId, 150);
        await expect(startLog(149)).rejects.toThrow('di bawah');
        const second = await startLog(150);
        await finishLog(second.mileageId, 150);
        await startLog(150);
        expect(await db!.vehicleTripMileage.count({ where: { tripId: null } })).toBe(3);
        expect(await db!.auditLog.count({ where: { action: 'START_VEHICLE_MILEAGE' } })).toBe(3);
        expect(await db!.auditLog.count({ where: { action: 'FINISH_VEHICLE_MILEAGE' } })).toBe(2);
    });
    it('serializes concurrent starts so exactly one record opens', async () => {
        const outcomes = await Promise.allSettled([startLog(100), startLog(100)]);
        expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
        expect(await db!.vehicleTripMileage.count({ where: { odometerEnd: null } })).toBe(1);
    });
    it('rejects non-factory vehicles and rolls back the record when the audit actor is invalid', async () => {
        await db!.vehicle.create({ data: { id: 'p', plateNumber: 'SYNTHETIC-PRIVATE', name: 'Private', ownershipType: 'PRIVATE' } });
        await expect(run(() => startVehicleMileage({ vehicleId: 'p', odometerStart: 1, driverName: 'D' }, 'km-user'))).rejects.toThrow('mobil pabrik');
        await expect(run(() => startVehicleMileage({ vehicleId: 'v', odometerStart: 1, driverName: 'D' }, 'missing-actor'))).rejects.toThrow();
        expect(await db!.vehicleTripMileage.count()).toBe(0);
    });
    it('corrects within neighbours with an audit of old values, new values and reason', async () => {
        const first = await startLog(100);
        await finishLog(first.mileageId, 150);
        const second = await startLog(150);
        await finishLog(second.mileageId, 200);
        const correct = (mileageId: string, odometerStart: number, odometerEnd: number | null, reason = 'synthetic reason') =>
            run(() => correctVehicleMileage({ mileageId, driverName: 'Synthetic Driver', odometerStart, odometerEnd, reason }, 'km-user'));
        await expect(correct(first.mileageId, 100, 151)).rejects.toThrow('berikutnya');
        await expect(correct(second.mileageId, 149, 200)).rejects.toThrow('di bawah');
        await expect(correct(first.mileageId, 100, null)).rejects.toThrow('dibuka kembali');
        await correct(first.mileageId, 90, 150);
        const audit = await db!.auditLog.findFirstOrThrow({ where: { action: 'CORRECT_VEHICLE_MILEAGE' } });
        expect(JSON.parse(audit.changes as string)).toMatchObject({
            reason: 'synthetic reason', oldValues: { odometerStart: 100 }, newValues: { odometerStart: 90 },
        });
        expect(await db!.auditLog.count({ where: { action: 'CORRECT_VEHICLE_MILEAGE' } })).toBe(1);
    });
    it('counts records without a trip in fleet totals and history rows', async () => {
        const record = await startLog(100);
        await finishLog(record.mileageId, 130);
        const [summary] = await run(() => getFleetSummaries(['v'], fleetMonth()));
        expect(summary).toMatchObject({ actualKm: 30, recordedTrips: 1, latestReading: { km: 130, scheduleId: null } });
        const history = await run(() => getFleetDistanceHistory('v', fleetMonth()));
        expect(history.rows.find((row) => row.mileageId === record.mileageId)).toMatchObject({ scheduleId: null, actualDistanceKm: 30, note: 'synthetic note' });
    });
    it('replays the mileage-log migration on top of the distance migration without touching existing rows', async () => {
        const schema = `km_log_migration_${randomUUID().replaceAll('-', '')}`;
        const client = new pg.Client({ connectionString: connection });
        await client.connect();
        try {
            await client.query('BEGIN');
            await client.query(`CREATE SCHEMA "${schema}"`);
            await client.query(`SET LOCAL search_path TO "${schema}"`);
            await client.query('CREATE TABLE "DeliveryScheduleVehicle" (id text PRIMARY KEY)');
            await client.query('CREATE TABLE "Vehicle" (id text PRIMARY KEY)');
            await client.query(readFileSync('prisma/migrations/20260923_factory_trip_distance/migration.sql', 'utf8'));
            await client.query('INSERT INTO "DeliveryScheduleVehicle" VALUES (\'t\')');
            await client.query('INSERT INTO "Vehicle" VALUES (\'v\')');
            await client.query('INSERT INTO "VehicleTripMileage" ("id", "tripId", "vehicleId", "driverName", "odometerStart", "updatedAt") VALUES (\'old\', \'t\', \'v\', \'D\', 10, now())');
            await client.query(readFileSync('prisma/migrations/20261107_vehicle_mileage_log/migration.sql', 'utf8'));
            const { rows } = await client.query('SELECT "tripId", "note" FROM "VehicleTripMileage"');
            expect(rows).toEqual([{ tripId: 't', note: null }]);
            await client.query('UPDATE "VehicleTripMileage" SET "odometerEnd" = 20, "returnedAt" = now()');
            await client.query('INSERT INTO "VehicleTripMileage" ("id", "vehicleId", "driverName", "odometerStart", "updatedAt") VALUES (\'a\', \'v\', \'D\', 20, now())');
            await expect(client.query('INSERT INTO "VehicleTripMileage" ("id", "vehicleId", "driverName", "odometerStart", "updatedAt") VALUES (\'b\', \'v\', \'D\', 20, now())')).rejects.toThrow();
        } finally {
            await client.query('ROLLBACK');
            await client.end();
        }
    });
    it.each([false, true])('replays additive migration with populated=%s; old km remain unknown', async (populated) => {
        const schema = `km_migration_${randomUUID().replaceAll('-', '')}`;
        const sql = readFileSync('prisma/migrations/20260923_factory_trip_distance/migration.sql', 'utf8');
        const client = new pg.Client({ connectionString: connection });
        await client.connect();
        try {
            await client.query('BEGIN');
            await client.query(`CREATE SCHEMA "${schema}"`);
            await client.query(`SET LOCAL search_path TO "${schema}"`);
            await client.query('CREATE TABLE "DeliveryScheduleVehicle" (id text PRIMARY KEY)');
            await client.query('CREATE TABLE "Vehicle" (id text PRIMARY KEY)');
            if (populated) await client.query('INSERT INTO "DeliveryScheduleVehicle" VALUES (\'old\')');
            await client.query(sql);
            const { rows } = await client.query('SELECT "plannedDistanceKm" FROM "DeliveryScheduleVehicle"');
            expect(rows).toEqual(populated ? [{ plannedDistanceKm: null }] : []);
        } finally {
            await client.query('ROLLBACK');
            await client.end();
        }
    });
});
