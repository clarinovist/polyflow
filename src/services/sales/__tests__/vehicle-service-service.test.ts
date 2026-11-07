import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    correctVehicleService, createServiceItem, listFleetServiceAlerts, listVehicleServiceStatus, recordVehicleService, updateServiceItem,
} from '../vehicle-service-service';

const mocks = vi.hoisted(() => {
    const tx = {
        $queryRaw: vi.fn(),
        vehicle: { findUnique: vi.fn() },
        vehicleServiceItem: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
        vehicleServiceRecord: { findUnique: vi.fn(), aggregate: vi.fn(), create: vi.fn(), update: vi.fn() },
    };
    return { tx, audit: vi.fn(), transaction: vi.fn(), context: vi.fn(), vehicleFind: vi.fn(), vehicleMany: vi.fn() };
});
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: mocks.context }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.audit }));

const NOW = new Date('2026-11-07T03:00:00Z');
const factory = (overrides: Record<string, unknown> = {}) => ({ id: 'v', ownershipType: 'FACTORY', status: 'ACTIVE', ...overrides });
const item = (overrides: Record<string, unknown> = {}) => ({
    id: 'i', vehicleId: 'v', label: 'Oli mesin', intervalKm: '10000', intervalDays: null, warnKm: '1000', isActive: true, ...overrides,
});
const record = (overrides: Record<string, unknown> = {}) => ({
    id: 'r', serviceItemId: 'i', vehicleId: 'v', servicedAt: new Date('2026-09-30T17:00:00Z'), odometerKm: '40000', note: null,
    serviceItem: { label: 'Oli mesin' }, ...overrides,
});
const recordInput = (overrides: Record<string, unknown> = {}) => ({ vehicleId: 'v', serviceItemId: 'i', servicedAt: '2026-11-07', odometerKm: 42000, note: 'ganti filter', ...overrides });
const bounds = (previous: string | null, next: string | null) => mocks.tx.vehicleServiceRecord.aggregate.mockImplementation(
    async (args) => ('_max' in args ? { _max: { odometerKm: previous } } : { _min: { odometerKm: next } }));
const correctionInput = (overrides: Record<string, unknown> = {}) => ({ recordId: 'r', servicedAt: '2026-10-01', odometerKm: 40500, note: undefined, reason: 'salah ketik', ...overrides });

beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation((fn) => fn(mocks.tx));
    mocks.context.mockReturnValue({ $transaction: mocks.transaction, vehicle: { findUnique: mocks.vehicleFind, findMany: mocks.vehicleMany } });
    mocks.tx.vehicle.findUnique.mockResolvedValue(factory());
    mocks.tx.vehicleServiceItem.findUnique.mockResolvedValue(item());
    mocks.tx.vehicleServiceItem.findFirst.mockResolvedValue(null);
    mocks.tx.vehicleServiceItem.create.mockResolvedValue({ id: 'new-item' });
    mocks.tx.vehicleServiceRecord.aggregate.mockImplementation(async (args) => ('_max' in args ? { _max: { odometerKm: null } } : { _min: { odometerKm: null } }));
    mocks.tx.vehicleServiceRecord.findUnique.mockResolvedValue(record());
    mocks.tx.vehicleServiceRecord.create.mockResolvedValue({ id: 'new-record' });
});

describe('createServiceItem', () => {
    const input = { vehicleId: 'v', label: ' Oli mesin ', intervalKm: 10000, intervalDays: 180 };
    it('locks the vehicle first, defaults the warning distance to 10 percent and audits in the transaction', async () => {
        await expect(createServiceItem(input, 'u')).resolves.toEqual({ itemId: 'new-item', vehicleId: 'v' });
        expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.vehicle.findUnique.mock.invocationCallOrder[0]);
        expect(mocks.tx.vehicleServiceItem.create).toHaveBeenCalledWith({
            data: { vehicleId: 'v', label: 'Oli mesin', intervalKm: 10000, intervalDays: 180, warnKm: 1000 },
        });
        expect(mocks.audit).toHaveBeenCalledWith({
            tx: mocks.tx, userId: 'u', entityType: 'VehicleServiceItem', entityId: 'new-item', action: 'CREATE_SERVICE_ITEM',
            changes: { vehicleId: 'v', label: 'Oli mesin', intervalKm: 10000, intervalDays: 180, warnKm: 1000 },
        });
    });
    it('keeps an explicit warning distance including zero and an empty day interval', async () => {
        await createServiceItem({ ...input, intervalDays: undefined, warnKm: 0 }, 'u');
        expect(mocks.tx.vehicleServiceItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ intervalDays: null, warnKm: 0 }) });
    });
    it.each([
        [factory({ ownershipType: 'PRIVATE' })],
        [factory({ status: 'INACTIVE' })],
        [factory({ status: 'MAINTENANCE' })],
    ])('rejects a non-factory or inactive truck %j', async (vehicle) => {
        mocks.tx.vehicle.findUnique.mockResolvedValue(vehicle);
        await expect(createServiceItem(input, 'u')).rejects.toThrow(/mobil pabrik/);
        expect(mocks.tx.vehicleServiceItem.create).not.toHaveBeenCalled();
    });
    it('rejects an unknown truck and a duplicate label (case-insensitive lookup)', async () => {
        mocks.tx.vehicle.findUnique.mockResolvedValue(null);
        await expect(createServiceItem(input, 'u')).rejects.toThrow('tidak ditemukan');
        mocks.tx.vehicle.findUnique.mockResolvedValue(factory());
        mocks.tx.vehicleServiceItem.findFirst.mockResolvedValue({ id: 'x' });
        await expect(createServiceItem(input, 'u')).rejects.toThrow('sudah ada');
        expect(mocks.tx.vehicleServiceItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { vehicleId: 'v', label: { equals: 'Oli mesin', mode: 'insensitive' } } }));
        expect(mocks.tx.vehicleServiceItem.create).not.toHaveBeenCalled();
    });
    it('rejects invalid input before opening a transaction', async () => {
        await expect(createServiceItem({ ...input, intervalKm: 0 }, 'u')).rejects.toThrow('lebih dari nol');
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
    it('propagates audit failure and fails closed without tenant context', async () => {
        mocks.audit.mockRejectedValue(new Error('audit unavailable'));
        await expect(createServiceItem(input, 'u')).rejects.toThrow('audit unavailable');
        mocks.context.mockReturnValue(undefined);
        await expect(createServiceItem(input, 'u')).rejects.toThrow('Konteks tenant');
    });
});

describe('updateServiceItem', () => {
    const input = { itemId: 'i', intervalKm: 12000, intervalDays: null };
    it('updates the interval, recomputes the default warning distance and audits old and new values', async () => {
        await expect(updateServiceItem(input, 'u')).resolves.toEqual({ itemId: 'i', vehicleId: 'v' });
        const newValues = { intervalKm: 12000, intervalDays: null, warnKm: 1200, isActive: true };
        expect(mocks.tx.vehicleServiceItem.update).toHaveBeenCalledWith({ where: { id: 'i' }, data: newValues });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
            entityType: 'VehicleServiceItem', entityId: 'i', action: 'UPDATE_SERVICE_ITEM',
            changes: { vehicleId: 'v', label: 'Oli mesin', oldValues: { intervalKm: 10000, intervalDays: null, warnKm: 1000, isActive: true }, newValues },
        }));
    });
    it('deactivates an item instead of deleting it', async () => {
        await updateServiceItem({ ...input, intervalKm: 10000, warnKm: 1000, isActive: false }, 'u');
        expect(mocks.tx.vehicleServiceItem.update).toHaveBeenCalledWith({ where: { id: 'i' }, data: expect.objectContaining({ isActive: false }) });
    });
    it('rejects an unchanged submission and an unknown item', async () => {
        await expect(updateServiceItem({ ...input, intervalKm: 10000, warnKm: 1000 }, 'u')).rejects.toThrow('Tidak ada perubahan');
        mocks.tx.vehicleServiceItem.findUnique.mockResolvedValue(null);
        await expect(updateServiceItem(input, 'u')).rejects.toThrow('tidak ditemukan');
        expect(mocks.tx.vehicleServiceItem.update).not.toHaveBeenCalled();
    });
    it('rejects a non-factory truck but still allows a truck in maintenance', async () => {
        mocks.tx.vehicle.findUnique.mockResolvedValue(factory({ ownershipType: 'PRIVATE' }));
        await expect(updateServiceItem(input, 'u')).rejects.toThrow('mobil pabrik');
        mocks.tx.vehicle.findUnique.mockResolvedValue(factory({ status: 'MAINTENANCE' }));
        await expect(updateServiceItem(input, 'u')).resolves.toBeDefined();
    });
    it('locks the owning vehicle before re-reading the item', async () => {
        mocks.tx.vehicleServiceItem.findUnique.mockResolvedValueOnce({ vehicleId: 'v' }).mockResolvedValueOnce(item());
        await updateServiceItem(input, 'u');
        expect(mocks.tx.vehicleServiceItem.findUnique.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.$queryRaw.mock.invocationCallOrder[0]);
        expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.vehicleServiceItem.findUnique.mock.invocationCallOrder[1]);
    });
});

describe('recordVehicleService', () => {
    it('creates a record with the item vehicle and audits the service in the same transaction', async () => {
        bounds('40000', null);
        await expect(recordVehicleService(recordInput(), 'u', NOW)).resolves.toEqual({ recordId: 'new-record', vehicleId: 'v' });
        expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.vehicle.findUnique.mock.invocationCallOrder[0]);
        expect(mocks.tx.vehicleServiceRecord.create).toHaveBeenCalledWith({
            data: { serviceItemId: 'i', vehicleId: 'v', servicedAt: new Date('2026-11-06T17:00:00Z'), odometerKm: 42000, note: 'ganti filter' },
        });
        expect(mocks.audit).toHaveBeenCalledWith({
            tx: mocks.tx, userId: 'u', entityType: 'VehicleServiceRecord', entityId: 'new-record', action: 'RECORD_VEHICLE_SERVICE',
            changes: { vehicleId: 'v', serviceItemId: 'i', label: 'Oli mesin', servicedAt: '2026-11-06T17:00:00.000Z', odometerKm: 42000, note: 'ganti filter' },
        });
    });
    it('records the very first service and a reading equal to its neighbours', async () => {
        await expect(recordVehicleService(recordInput({ note: undefined }), 'u', NOW)).resolves.toBeDefined();
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ changes: expect.objectContaining({ note: null }) }));
        bounds('42000', '42000');
        await expect(recordVehicleService(recordInput(), 'u', NOW)).resolves.toBeDefined();
    });
    it('bounds the new date by earlier and later dates of the same item only', async () => {
        await recordVehicleService(recordInput({ servicedAt: '2026-10-15' }), 'u', NOW);
        const day = new Date('2026-10-14T17:00:00Z');
        expect(mocks.tx.vehicleServiceRecord.aggregate).toHaveBeenCalledWith({ where: { serviceItemId: 'i', servicedAt: { lt: day } }, _max: { odometerKm: true } });
        expect(mocks.tx.vehicleServiceRecord.aggregate).toHaveBeenCalledWith({ where: { serviceItemId: 'i', servicedAt: { gt: day } }, _min: { odometerKm: true } });
    });
    it('does not constrain a record against another record of the same date', async () => {
        await recordVehicleService(recordInput(), 'u', NOW);
        for (const [args] of mocks.tx.vehicleServiceRecord.aggregate.mock.calls) {
            expect(JSON.stringify(args.where.servicedAt)).not.toContain('lte');
            expect(JSON.stringify(args.where.servicedAt)).not.toContain('gte');
        }
    });
    it('rejects a km below the previous service', async () => {
        bounds('42001', null);
        await expect(recordVehicleService(recordInput(), 'u', NOW)).rejects.toThrow('di bawah KM servis sebelumnya');
        expect(mocks.tx.vehicleServiceRecord.create).not.toHaveBeenCalled();
    });
    it('rejects a backdated service whose km is above the next service', async () => {
        bounds(null, '41999');
        await expect(recordVehicleService(recordInput({ servicedAt: '2026-09-01' }), 'u', NOW)).rejects.toThrow('di atas KM servis sesudahnya');
    });
    it('rejects a future date before opening a transaction', async () => {
        await expect(recordVehicleService(recordInput({ servicedAt: '2026-11-08' }), 'u', NOW)).rejects.toThrow('masa depan');
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
    it('rejects an item that belongs to another truck', async () => {
        mocks.tx.vehicleServiceItem.findUnique.mockResolvedValue(item({ vehicleId: 'other' }));
        await expect(recordVehicleService(recordInput(), 'u', NOW)).rejects.toThrow('bukan milik kendaraan');
        expect(mocks.tx.vehicleServiceRecord.create).not.toHaveBeenCalled();
    });
    it('rejects an unknown item, a deactivated item and a non-factory truck', async () => {
        mocks.tx.vehicleServiceItem.findUnique.mockResolvedValue(null);
        await expect(recordVehicleService(recordInput(), 'u', NOW)).rejects.toThrow('tidak ditemukan');
        mocks.tx.vehicleServiceItem.findUnique.mockResolvedValue(item({ isActive: false }));
        await expect(recordVehicleService(recordInput(), 'u', NOW)).rejects.toThrow('dinonaktifkan');
        mocks.tx.vehicle.findUnique.mockResolvedValue(factory({ ownershipType: 'PRIVATE' }));
        await expect(recordVehicleService(recordInput(), 'u', NOW)).rejects.toThrow('mobil pabrik');
    });
    it('allows recording on a truck that is in maintenance', async () => {
        mocks.tx.vehicle.findUnique.mockResolvedValue(factory({ status: 'MAINTENANCE' }));
        await expect(recordVehicleService(recordInput(), 'u', NOW)).resolves.toBeDefined();
    });
    it('propagates audit failure instead of reporting unaudited success', async () => {
        mocks.audit.mockRejectedValue(new Error('audit unavailable'));
        await expect(recordVehicleService(recordInput(), 'u', NOW)).rejects.toThrow('audit unavailable');
    });
});

describe('correctVehicleService', () => {
    it('corrects the km, excluding itself from the neighbours, and audits old values, new values and reason', async () => {
        await expect(correctVehicleService(correctionInput(), 'u', NOW)).resolves.toEqual({ recordId: 'r', vehicleId: 'v' });
        const day = new Date('2026-09-30T17:00:00Z');
        expect(mocks.tx.vehicleServiceRecord.aggregate).toHaveBeenCalledWith({ where: { serviceItemId: 'i', id: { not: 'r' }, servicedAt: { lt: day } }, _max: { odometerKm: true } });
        expect(mocks.tx.vehicleServiceRecord.aggregate).toHaveBeenCalledWith({ where: { serviceItemId: 'i', id: { not: 'r' }, servicedAt: { gt: day } }, _min: { odometerKm: true } });
        expect(mocks.tx.vehicleServiceRecord.update).toHaveBeenCalledWith({
            where: { id: 'r' }, data: { servicedAt: new Date('2026-09-30T17:00:00Z'), odometerKm: 40500, note: null },
        });
        expect(mocks.audit).toHaveBeenCalledWith({
            tx: mocks.tx, userId: 'u', entityType: 'VehicleServiceRecord', entityId: 'r', action: 'CORRECT_VEHICLE_SERVICE',
            changes: {
                vehicleId: 'v', serviceItemId: 'i', label: 'Oli mesin', reason: 'salah ketik',
                oldValues: { servicedAt: '2026-09-30T17:00:00.000Z', odometerKm: 40000, note: null },
                newValues: { servicedAt: '2026-09-30T17:00:00.000Z', odometerKm: 40500, note: null },
            },
        });
    });
    it('rejects a correction against either neighbour', async () => {
        bounds('40600', null);
        await expect(correctVehicleService(correctionInput(), 'u', NOW)).rejects.toThrow('di bawah KM servis sebelumnya');
        bounds(null, '40400');
        await expect(correctVehicleService(correctionInput(), 'u', NOW)).rejects.toThrow('di atas KM servis sesudahnya');
        expect(mocks.tx.vehicleServiceRecord.update).not.toHaveBeenCalled();
    });
    it('rejects an unchanged correction, a future date, a short reason and an unknown record', async () => {
        await expect(correctVehicleService(correctionInput({ odometerKm: 40000 }), 'u', NOW)).rejects.toThrow('Tidak ada perubahan');
        await expect(correctVehicleService(correctionInput({ servicedAt: '2026-11-08' }), 'u', NOW)).rejects.toThrow('masa depan');
        await expect(correctVehicleService(correctionInput({ reason: 'abc' }), 'u', NOW)).rejects.toThrow('minimal 5');
        mocks.tx.vehicleServiceRecord.findUnique.mockResolvedValue(null);
        await expect(correctVehicleService(correctionInput(), 'u', NOW)).rejects.toThrow('tidak ditemukan');
    });
    it('treats a changed note as a correction and rejects a non-factory truck', async () => {
        await correctVehicleService(correctionInput({ odometerKm: 40000, note: 'tambah keterangan' }), 'u', NOW);
        expect(mocks.tx.vehicleServiceRecord.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ note: 'tambah keterangan' }) }));
        mocks.tx.vehicle.findUnique.mockResolvedValue(factory({ ownershipType: 'PRIVATE' }));
        await expect(correctVehicleService(correctionInput(), 'u', NOW)).rejects.toThrow('mobil pabrik');
    });
    it('locks the owning vehicle before re-reading the record', async () => {
        mocks.tx.vehicleServiceRecord.findUnique.mockResolvedValueOnce({ vehicleId: 'v' }).mockResolvedValueOnce(record());
        await correctVehicleService(correctionInput(), 'u', NOW);
        expect(mocks.tx.vehicleServiceRecord.findUnique.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.$queryRaw.mock.invocationCallOrder[0]);
        expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.vehicleServiceRecord.findUnique.mock.invocationCallOrder[1]);
    });
});

describe('listVehicleServiceStatus', () => {
    const vehicleRow = (overrides: Record<string, unknown> = {}) => ({
        id: 'v', ownershipType: 'FACTORY', status: 'ACTIVE',
        tripMileages: [{ odometerStart: '49500', odometerEnd: null }],
        serviceItems: [
            { ...item(), records: [
                { id: 'a', servicedAt: new Date('2026-08-01T00:00:00Z'), odometerKm: '30000', note: null },
                { id: 'b', servicedAt: new Date('2026-10-01T00:00:00Z'), odometerKm: '40000', note: 'rutin' },
            ] },
            { ...item({ id: 'n', label: 'Ban' }), records: [] },
        ],
        ...overrides,
    });
    it('computes status from the newest record and the latest mileage reading', async () => {
        mocks.vehicleFind.mockResolvedValue(vehicleRow());
        const view = await listVehicleServiceStatus('v', NOW);
        expect(view).toMatchObject({ vehicleId: 'v', ownershipType: 'FACTORY', vehicleStatus: 'ACTIVE', latestMileageKm: 49500 });
        expect(view.items[0]).toMatchObject({
            id: 'i', status: 'SEGERA', dueKm: 50000, remainingKm: 500, remainingText: 'sisa 500 km', suggestedKm: 49500, intervalKm: 10000, warnKm: 1000,
        });
        expect(view.items[0].records.map((entry) => entry.id)).toEqual(['b', 'a']);
        expect(view.items[0].records[0]).toEqual({ id: 'b', servicedAt: '2026-10-01T00:00:00.000Z', odometerKm: 40000, note: 'rutin' });
    });
    it('uses the highest km of the latest date as the baseline when same-day records are in any id order', async () => {
        const sameDay = new Date('2026-10-01T00:00:00Z');
        mocks.vehicleFind.mockResolvedValue(vehicleRow({
            tripMileages: [],
            serviceItems: [{ ...item(), records: [
                { id: 'z-high-id', servicedAt: sameDay, odometerKm: '40000', note: null },
                { id: 'a-low-id', servicedAt: sameDay, odometerKm: '40200', note: null },
            ] }],
        }));
        const [only] = (await listVehicleServiceStatus('v', NOW)).items;
        expect(only).toMatchObject({ dueKm: 50200, currentKm: 40200 });
        expect(only.records.map((entry) => entry.odometerKm)).toEqual([40200, 40000]);
    });
    it('asks the database for the newest record by date, then highest km, then id', async () => {
        mocks.vehicleMany.mockResolvedValue([]);
        await listFleetServiceAlerts(NOW);
        const select = mocks.vehicleMany.mock.calls[0][0].select.serviceItems.include.records;
        expect(select).toEqual({ orderBy: [{ servicedAt: 'desc' }, { odometerKm: 'desc' }, { id: 'desc' }], take: 1 });
    });
    it('shows an item without history as BELUM_ADA_DATA and suggests the latest mileage', async () => {
        mocks.vehicleFind.mockResolvedValue(vehicleRow());
        const view = await listVehicleServiceStatus('v', NOW);
        expect(view.items[1]).toMatchObject({ status: 'BELUM_ADA_DATA', remainingText: null, suggestedKm: 49500, records: [] });
    });
    it('uses the end reading when the newest mileage record is closed and null when there is none', async () => {
        mocks.vehicleFind.mockResolvedValue(vehicleRow({ tripMileages: [{ odometerStart: '49500', odometerEnd: '49800' }] }));
        expect((await listVehicleServiceStatus('v', NOW)).latestMileageKm).toBe(49800);
        mocks.vehicleFind.mockResolvedValue(vehicleRow({ tripMileages: [] }));
        const view = await listVehicleServiceStatus('v', NOW);
        expect(view.latestMileageKm).toBeNull();
        expect(view.items[0]).toMatchObject({ currentKm: 40000, status: 'AMAN' });
    });
    it('throws for an unknown truck', async () => {
        mocks.vehicleFind.mockResolvedValue(null);
        await expect(listVehicleServiceStatus('x', NOW)).rejects.toThrow('tidak ditemukan');
    });
});

describe('listFleetServiceAlerts', () => {
    const fleetRow = (id: string, plate: string, odometer: string, records: unknown[] = [{ id: 'r', servicedAt: new Date('2026-10-01T00:00:00Z'), odometerKm: '40000', note: null }]) => ({
        id, plateNumber: plate, tripMileages: [{ odometerStart: odometer, odometerEnd: null }],
        serviceItems: [{ ...item({ vehicleId: id }), records }],
    });
    it('returns only trucks with a SEGERA or LEWAT active item, with the text for the badge', async () => {
        mocks.vehicleMany.mockResolvedValue([
            fleetRow('a', 'B 1 A', '41000'),
            fleetRow('b', 'B 2 B', '49680'),
            fleetRow('c', 'B 3 C', '51200'),
            fleetRow('d', 'B 4 D', '60000', []),
        ]);
        const alerts = await listFleetServiceAlerts(NOW);
        expect(alerts).toEqual([
            { vehicleId: 'b', plateNumber: 'B 2 B', items: [{ itemId: 'i', label: 'Oli mesin', status: 'SEGERA', dueBy: 'KM', remainingText: 'sisa 320 km' }] },
            { vehicleId: 'c', plateNumber: 'B 3 C', items: [{ itemId: 'i', label: 'Oli mesin', status: 'LEWAT', dueBy: 'KM', remainingText: 'lewat 1.200 km' }] },
        ]);
        expect(mocks.vehicleMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownershipType: 'FACTORY', status: 'ACTIVE' } }));
    });
    it('returns an empty list when nothing needs service', async () => {
        mocks.vehicleMany.mockResolvedValue([]);
        expect(await listFleetServiceAlerts(NOW)).toEqual([]);
    });
});
