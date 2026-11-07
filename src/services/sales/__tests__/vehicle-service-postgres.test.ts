import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { tenantContext } from '@/lib/core/prisma';
import { returnTestClient, verifyReturnTestDatabase } from '../../finance/__tests__/return-credit-postgres-fixture';
import {
    correctVehicleService, createServiceItem, listFleetServiceAlerts, listVehicleServiceStatus, recordVehicleService, updateServiceItem,
} from '../vehicle-service-service';

const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = connection ? returnTestClient(connection) : null;
const otherUrl = connection ? new URL(connection) : null;
if (otherUrl) otherUrl.pathname = '/polyflow_return_credit_tenant_test';
const other = otherUrl ? returnTestClient(otherUrl.toString()) : null;
const run = <T>(fn: () => Promise<T>) => tenantContext.run(db!, fn);
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

async function seed(client: PrismaClient) {
    await verifyReturnTestDatabase(client);
    await client.$executeRaw`TRUNCATE "VehicleServiceRecord", "VehicleServiceItem", "VehicleTripMileage", "Vehicle", "User", "AuditLog" CASCADE`;
    await client.user.create({ data: { id: 'svc-user', email: 'svc@example.invalid', password: 'synthetic-only', role: 'SALES' } });
    await client.vehicle.create({ data: { id: 'v', plateNumber: 'SYNTHETIC-SVC', name: 'Factory vehicle', ownershipType: 'FACTORY' } });
    await client.vehicle.create({ data: { id: 'v2', plateNumber: 'SYNTHETIC-SVC-2', name: 'Second vehicle', ownershipType: 'FACTORY' } });
}
const addItem = (vehicleId = 'v', label = 'Oli mesin', intervalKm = 10000, intervalDays: number | null = 180) =>
    run(() => createServiceItem({ vehicleId, label, intervalKm, intervalDays }, 'svc-user'));
const record = (serviceItemId: string, odometerKm: number, servicedAt = today(), vehicleId = 'v') =>
    run(() => recordVehicleService({ vehicleId, serviceItemId, servicedAt, odometerKm, note: 'synthetic note' }, 'svc-user'));
const rawItem = (data: Record<string, unknown> = {}) => ({ id: randomUUID(), vehicleId: 'v', label: `L-${randomUUID()}`, intervalKm: 10000, warnKm: 1000, ...data });

describe.skipIf(!db)('vehicle service reminder PostgreSQL contracts', () => {
    beforeEach(async () => seed(db!));
    afterAll(async () => { await Promise.all([db?.$disconnect(), other?.$disconnect()]); });

    it('enforces the value CHECK constraints for writers that bypass the service layer', async () => {
        await expect(db!.vehicleServiceItem.create({ data: rawItem({ intervalKm: 0 }) })).rejects.toThrow();
        await expect(db!.vehicleServiceItem.create({ data: rawItem({ intervalKm: -1 }) })).rejects.toThrow();
        await expect(db!.vehicleServiceItem.create({ data: rawItem({ warnKm: -1 }) })).rejects.toThrow();
        await expect(db!.vehicleServiceItem.create({ data: rawItem({ intervalDays: 0 }) })).rejects.toThrow();
        await expect(db!.vehicleServiceItem.create({ data: rawItem({ intervalDays: -5 }) })).rejects.toThrow();
        await db!.vehicleServiceItem.create({ data: rawItem({ warnKm: 0, intervalDays: null }) });
        await db!.vehicleServiceItem.create({ data: rawItem({ intervalDays: 30 }) });
        const item = await db!.vehicleServiceItem.findFirstOrThrow();
        await expect(db!.vehicleServiceRecord.create({ data: { serviceItemId: item.id, vehicleId: 'v', servicedAt: new Date(), odometerKm: -1 } })).rejects.toThrow();
        await db!.vehicleServiceRecord.create({ data: { serviceItemId: item.id, vehicleId: 'v', servicedAt: new Date(), odometerKm: 0 } });
        expect(await db!.vehicleServiceItem.count()).toBe(2);
    });

    it('keeps one label per truck but allows the same label on another truck', async () => {
        await db!.vehicleServiceItem.create({ data: rawItem({ label: 'Oli mesin' }) });
        await expect(db!.vehicleServiceItem.create({ data: rawItem({ label: 'Oli mesin' }) })).rejects.toMatchObject({ code: 'P2002' });
        await db!.vehicleServiceItem.create({ data: rawItem({ label: 'Oli mesin', vehicleId: 'v2' }) });
        await expect(addItem('v', 'oli MESIN')).rejects.toThrow('sudah ada');
    });

    it('rejects a record whose vehicle differs from its service item, on insert and on update', async () => {
        const item = await db!.vehicleServiceItem.create({ data: rawItem() });
        await expect(db!.vehicleServiceRecord.create({ data: { serviceItemId: item.id, vehicleId: 'v2', servicedAt: new Date(), odometerKm: 1 } })).rejects.toThrow('must match');
        const good = await db!.vehicleServiceRecord.create({ data: { serviceItemId: item.id, vehicleId: 'v', servicedAt: new Date(), odometerKm: 1 } });
        await expect(db!.vehicleServiceRecord.update({ where: { id: good.id }, data: { vehicleId: 'v2' } })).rejects.toThrow('must match');
        await expect(db!.vehicleServiceRecord.update({ where: { id: good.id }, data: { odometerKm: 5 } })).resolves.toBeDefined();
        expect(await db!.vehicleServiceRecord.count()).toBe(1);
    });

    it('refuses to move an item with history to another truck and keeps FKs restrictive', async () => {
        const item = await db!.vehicleServiceItem.create({ data: rawItem() });
        await db!.vehicleServiceItem.update({ where: { id: item.id }, data: { vehicleId: 'v2' } });
        await db!.vehicleServiceItem.update({ where: { id: item.id }, data: { vehicleId: 'v' } });
        await db!.vehicleServiceRecord.create({ data: { serviceItemId: item.id, vehicleId: 'v', servicedAt: new Date(), odometerKm: 1 } });
        await expect(db!.vehicleServiceItem.update({ where: { id: item.id }, data: { vehicleId: 'v2' } })).rejects.toThrow('cannot change vehicle');
        await expect(db!.vehicleServiceItem.delete({ where: { id: item.id } })).rejects.toMatchObject({ code: 'P2003' });
        await expect(db!.vehicle.delete({ where: { id: 'v' } })).rejects.toMatchObject({ code: 'P2003' });
    });

    it('creates items and records through the service with atomic audit and a monotonic chain', async () => {
        const { itemId } = await addItem();
        const created = await db!.vehicleServiceItem.findUniqueOrThrow({ where: { id: itemId } });
        expect(Number(created.warnKm)).toBe(1000);
        await record(itemId, 40000, '2026-09-01');
        await record(itemId, 45000, '2026-10-01');
        await expect(record(itemId, 44000, '2026-10-02')).rejects.toThrow('di bawah');
        await expect(record(itemId, 46000, '2026-09-15')).rejects.toThrow('di atas');
        await record(itemId, 42000, '2026-09-15');
        await expect(record(itemId, 40000, '2999-01-01')).rejects.toThrow('masa depan');
        await expect(record(itemId, 40000, '2026-10-01', 'v2')).rejects.toThrow('bukan milik');
        expect(await db!.vehicleServiceRecord.count()).toBe(3);
        expect(await db!.auditLog.count({ where: { action: 'CREATE_SERVICE_ITEM' } })).toBe(1);
        expect(await db!.auditLog.count({ where: { action: 'RECORD_VEHICLE_SERVICE' } })).toBe(3);
    });

    it('serializes concurrent records on one truck so the chain cannot be broken', async () => {
        const { itemId } = await addItem();
        await record(itemId, 100, '2026-10-01');
        const outcomes = await Promise.allSettled([record(itemId, 200, '2026-10-02'), record(itemId, 150, '2026-10-02'), record(itemId, 50, '2026-10-03')]);
        expect(outcomes.filter((outcome) => outcome.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
        const rows = (await db!.vehicleServiceRecord.findMany()).map((row) => ({ at: row.servicedAt.getTime(), km: Number(row.odometerKm) }));
        for (const earlier of rows) for (const later of rows) if (earlier.at < later.at) expect(earlier.km).toBeLessThanOrEqual(later.km);
    });

    it('lets two services of one item on the same date coexist in either km order', async () => {
        const { itemId } = await addItem();
        await record(itemId, 200, '2026-10-01');
        await record(itemId, 150, '2026-10-01');
        await expect(record(itemId, 149, '2026-10-02')).rejects.toThrow('di bawah');
        await record(itemId, 200, '2026-10-02');
        expect(await db!.vehicleServiceRecord.count()).toBe(3);
    });

    it('rejects non-factory trucks and rolls back when the audit actor is invalid', async () => {
        await db!.vehicle.create({ data: { id: 'p', plateNumber: 'SYNTHETIC-PRIVATE', name: 'Private', ownershipType: 'PRIVATE' } });
        await expect(addItem('p')).rejects.toThrow('mobil pabrik');
        await expect(run(() => createServiceItem({ vehicleId: 'v', label: 'Ban', intervalKm: 50000 }, 'missing-actor'))).rejects.toThrow();
        expect(await db!.vehicleServiceItem.count()).toBe(0);
        const { itemId } = await addItem();
        await expect(run(() => recordVehicleService({ vehicleId: 'v', serviceItemId: itemId, servicedAt: today(), odometerKm: 1 }, 'missing-actor'))).rejects.toThrow();
        expect(await db!.vehicleServiceRecord.count()).toBe(0);
    });

    it('updates an interval and deactivates an item with an audit of old and new values', async () => {
        const { itemId } = await addItem();
        await run(() => updateServiceItem({ itemId, intervalKm: 12000, intervalDays: null }, 'svc-user'));
        const updated = await db!.vehicleServiceItem.findUniqueOrThrow({ where: { id: itemId } });
        expect([Number(updated.intervalKm), updated.intervalDays, Number(updated.warnKm), updated.isActive]).toEqual([12000, null, 1200, true]);
        await run(() => updateServiceItem({ itemId, intervalKm: 12000, intervalDays: null, isActive: false }, 'svc-user'));
        expect((await db!.vehicleServiceItem.findUniqueOrThrow({ where: { id: itemId } })).isActive).toBe(false);
        const audit = await db!.auditLog.findFirstOrThrow({ where: { action: 'UPDATE_SERVICE_ITEM' }, orderBy: { createdAt: 'asc' } });
        expect(JSON.parse(audit.changes as string)).toMatchObject({ oldValues: { intervalKm: 10000, intervalDays: 180 }, newValues: { intervalKm: 12000, intervalDays: null } });
        expect(await db!.auditLog.count({ where: { action: 'UPDATE_SERVICE_ITEM' } })).toBe(2);
        await expect(record(itemId, 1)).rejects.toThrow('dinonaktifkan');
    });

    it('corrects within the neighbours with an audit of old values, new values and reason', async () => {
        const { itemId } = await addItem();
        const first = await record(itemId, 100, '2026-09-01');
        const second = await record(itemId, 200, '2026-10-01');
        const correct = (recordId: string, odometerKm: number, servicedAt: string, reason = 'synthetic reason') =>
            run(() => correctVehicleService({ recordId, servicedAt, odometerKm, reason }, 'svc-user'));
        await expect(correct(first.recordId, 201, '2026-09-01')).rejects.toThrow('di atas');
        await expect(correct(second.recordId, 99, '2026-10-01')).rejects.toThrow('di bawah');
        await expect(correct(second.recordId, 200, '2026-10-01')).rejects.toThrow('Tidak ada perubahan');
        await correct(first.recordId, 90, '2026-09-01');
        const audit = await db!.auditLog.findFirstOrThrow({ where: { action: 'CORRECT_VEHICLE_SERVICE' } });
        expect(JSON.parse(audit.changes as string)).toMatchObject({ reason: 'synthetic reason', oldValues: { odometerKm: 100 }, newValues: { odometerKm: 90 } });
        expect(await db!.auditLog.count({ where: { action: 'CORRECT_VEHICLE_SERVICE' } })).toBe(1);
    });

    it('derives status and fleet alerts from the records and the mileage book', async () => {
        const { itemId } = await addItem('v', 'Oli mesin', 10000, null); // km-only, so the result does not depend on today's date
        await record(itemId, 40000, '2026-10-01');
        await db!.vehicleTripMileage.create({ data: { vehicleId: 'v', driverName: 'Synthetic Driver', odometerStart: 49500, odometerEnd: 49680, returnedAt: new Date() } });
        const view = await run(() => listVehicleServiceStatus('v'));
        expect(view.items[0]).toMatchObject({ status: 'SEGERA', currentKm: 49680, remainingKm: 320, remainingText: 'sisa 320 km' });
        const alerts = await run(() => listFleetServiceAlerts());
        expect(alerts).toMatchObject([{ vehicleId: 'v', items: [{ label: 'Oli mesin', status: 'SEGERA' }] }]);
        await expect(run(() => listVehicleServiceStatus('missing'))).rejects.toThrow('tidak ditemukan');
    });

    it('isolates writes and reads by actual tenant client', async () => {
        await seed(other!);
        const { itemId } = await addItem();
        await record(itemId, 100);
        expect(await other!.vehicleServiceItem.count()).toBe(0);
        await tenantContext.run(other!, () => createServiceItem({ vehicleId: 'v', label: 'Oli mesin', intervalKm: 5000 }, 'svc-user'));
        expect(Number((await db!.vehicleServiceItem.findFirstOrThrow()).intervalKm)).toBe(10000);
        expect(Number((await other!.vehicleServiceItem.findFirstOrThrow()).intervalKm)).toBe(5000);
        expect(await other!.vehicleServiceRecord.count()).toBe(0);
    });

    it('replays the migration on an existing schema: additive, CHECKs and the vehicle trigger hold', async () => {
        const schema = `svc_migration_${randomUUID().replaceAll('-', '')}`;
        const client = new pg.Client({ connectionString: connection });
        await client.connect();
        try {
            await client.query('BEGIN');
            await client.query(`CREATE SCHEMA "${schema}"`);
            await client.query(`SET LOCAL search_path TO "${schema}"`);
            await client.query('CREATE TABLE "Vehicle" (id text PRIMARY KEY)');
            await client.query('INSERT INTO "Vehicle" VALUES (\'v\'), (\'w\')');
            await client.query(readFileSync('prisma/migrations/20261108_vehicle_service_reminder/migration.sql', 'utf8'));
            expect((await client.query('SELECT count(*)::int AS n FROM "VehicleServiceItem"')).rows[0].n).toBe(0);
            await client.query('INSERT INTO "VehicleServiceItem" ("id", "vehicleId", "label", "intervalKm", "warnKm", "updatedAt") VALUES (\'a\', \'v\', \'a\', 1000, 100, now())');
            await client.query('SAVEPOINT s1');
            await expect(client.query('INSERT INTO "VehicleServiceItem" ("id", "vehicleId", "label", "intervalKm", "warnKm", "updatedAt") VALUES (\'z\', \'v\', \'z\', 0, 0, now())')).rejects.toThrow();
            await client.query('ROLLBACK TO SAVEPOINT s1');
            await expect(client.query('INSERT INTO "VehicleServiceRecord" ("id", "serviceItemId", "vehicleId", "servicedAt", "odometerKm", "updatedAt") VALUES (\'r\', \'a\', \'w\', now(), 1, now())')).rejects.toThrow('must match');
            await client.query('ROLLBACK TO SAVEPOINT s1');
            await client.query('INSERT INTO "VehicleServiceRecord" ("id", "serviceItemId", "vehicleId", "servicedAt", "odometerKm", "updatedAt") VALUES (\'r\', \'a\', \'v\', now(), 1, now())');
            await expect(client.query('UPDATE "VehicleServiceItem" SET "vehicleId" = \'w\' WHERE id = \'a\'')).rejects.toThrow('cannot change vehicle');
        } finally {
            await client.query('ROLLBACK');
            await client.end();
        }
    });
});
