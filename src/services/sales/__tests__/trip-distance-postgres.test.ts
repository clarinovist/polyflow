import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { tenantContext } from '@/lib/core/prisma';
import { returnTestClient, verifyReturnTestDatabase } from '../../finance/__tests__/return-credit-postgres-fixture';
import { finishTripMileage, saveRouteDistance, saveTripDistancePlan, startTripMileage } from '../trip-distance-service';
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
describe.skipIf(!db)('factory mileage PostgreSQL contracts', () => {
    beforeEach(async () => seed(db!));
    afterAll(async () => { await Promise.all([db?.$disconnect(), other?.$disconnect()]); });
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
        await finish(record.tripId);
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
