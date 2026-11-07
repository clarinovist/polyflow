import { beforeEach, describe, expect, it, vi } from 'vitest';
import { correctVehicleMileage, finishVehicleMileage, listFleetMileageBoard, startVehicleMileage } from '../vehicle-mileage-service';

const mocks = vi.hoisted(() => {
    const tx = {
        $queryRaw: vi.fn(),
        vehicle: { findUnique: vi.fn() },
        vehicleTripMileage: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    };
    return { tx, audit: vi.fn(), transaction: vi.fn(), context: vi.fn(), vehicles: vi.fn() };
});
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: mocks.context }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.audit }));

const factoryVehicle = () => ({ id: 'v', ownershipType: 'FACTORY', status: 'ACTIVE' });
const record = (overrides: Record<string, unknown> = {}) => ({
    id: 'm', vehicleId: 'v', tripId: null, driverName: 'Sopir A', odometerStart: '100', odometerEnd: '150',
    startedAt: new Date('2026-11-06T01:00:00Z'), returnedAt: new Date('2026-11-06T08:00:00Z'), note: null, ...overrides,
});
const correction = (overrides: Record<string, unknown> = {}) => ({
    mileageId: 'm', driverName: 'Sopir A', odometerStart: 100, odometerEnd: 160, reason: 'salah ketik', ...overrides,
});
beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation((fn) => fn(mocks.tx));
    mocks.context.mockReturnValue({ $transaction: mocks.transaction, vehicle: { findMany: mocks.vehicles } });
    mocks.tx.vehicle.findUnique.mockResolvedValue(factoryVehicle());
    mocks.tx.vehicleTripMileage.findFirst.mockResolvedValue(null);
    mocks.tx.vehicleTripMileage.create.mockResolvedValue({ id: 'new' });
});

describe('startVehicleMileage', () => {
    const input = { vehicleId: 'v', driverName: ' Sopir A ', odometerStart: 200, note: 'ke gudang' };
    it('locks the vehicle first, creates an unlinked record and audits in the same transaction', async () => {
        mocks.tx.vehicleTripMileage.findFirst.mockResolvedValue(record({ odometerEnd: '200' }));
        await expect(startVehicleMileage(input, 'u')).resolves.toEqual({ mileageId: 'new', vehicleId: 'v' });
        expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.vehicle.findUnique.mock.invocationCallOrder[0]);
        expect(mocks.tx.vehicleTripMileage.create).toHaveBeenCalledWith({ data: { vehicleId: 'v', driverName: 'Sopir A', odometerStart: 200, note: 'ke gudang' } });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
            tx: mocks.tx, userId: 'u', entityType: 'VehicleTripMileage', entityId: 'new', action: 'START_VEHICLE_MILEAGE',
        }));
    });
    it('starts the first ever record without a previous reading', async () => {
        await startVehicleMileage({ vehicleId: 'v', driverName: 'S', odometerStart: 0 }, 'u');
        expect(mocks.tx.vehicleTripMileage.create).toHaveBeenCalledTimes(1);
    });
    it('rejects a start below the previous end', async () => {
        mocks.tx.vehicleTripMileage.findFirst.mockResolvedValue(record({ odometerEnd: '201' }));
        await expect(startVehicleMileage(input, 'u')).rejects.toThrow('di bawah');
        expect(mocks.tx.vehicleTripMileage.create).not.toHaveBeenCalled();
    });
    it('rejects a second open record for the same vehicle', async () => {
        mocks.tx.vehicleTripMileage.findFirst.mockResolvedValue(record({ odometerEnd: null, returnedAt: null }));
        await expect(startVehicleMileage(input, 'u')).rejects.toThrow('terlebih dahulu');
        expect(mocks.tx.vehicleTripMileage.create).not.toHaveBeenCalled();
    });
    it.each([
        [{ ...factoryVehicle(), ownershipType: 'PRIVATE' }],
        [{ ...factoryVehicle(), status: 'INACTIVE' }],
        [{ ...factoryVehicle(), status: 'MAINTENANCE' }],
    ])('rejects non-factory or inactive vehicle %j', async (vehicle) => {
        mocks.tx.vehicle.findUnique.mockResolvedValue(vehicle);
        await expect(startVehicleMileage(input, 'u')).rejects.toThrow('mobil pabrik yang aktif');
        expect(mocks.tx.vehicleTripMileage.create).not.toHaveBeenCalled();
    });
    it('rejects an unknown vehicle and invalid input before opening a transaction', async () => {
        mocks.tx.vehicle.findUnique.mockResolvedValue(null);
        await expect(startVehicleMileage(input, 'u')).rejects.toThrow('tidak ditemukan');
        await expect(startVehicleMileage({ ...input, odometerStart: -1 }, 'u')).rejects.toThrow();
        expect(mocks.transaction).toHaveBeenCalledTimes(1);
    });
    it('propagates audit failure instead of reporting unaudited success', async () => {
        mocks.audit.mockRejectedValue(new Error('audit unavailable'));
        await expect(startVehicleMileage(input, 'u')).rejects.toThrow('audit unavailable');
    });
    it('fails closed without tenant context', async () => {
        mocks.context.mockReturnValue(undefined);
        await expect(startVehicleMileage(input, 'u')).rejects.toThrow('Konteks tenant');
    });
});

describe('finishVehicleMileage', () => {
    const open = () => record({ odometerEnd: null, returnedAt: null });
    it('closes an open record, stamping the return time, and audits the distance', async () => {
        mocks.tx.vehicleTripMileage.findUnique.mockResolvedValue(open());
        await finishVehicleMileage({ mileageId: 'm', odometerEnd: 184 }, 'u');
        expect(mocks.tx.vehicleTripMileage.update).toHaveBeenCalledWith({ where: { id: 'm' }, data: { odometerEnd: 184, returnedAt: expect.any(Date) } });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
            tx: mocks.tx, action: 'FINISH_VEHICLE_MILEAGE', changes: { vehicleId: 'v', odometerEnd: 184, actualDistanceKm: 84 },
        }));
    });
    it('is idempotent for the same end reading but refuses to overwrite a different one', async () => {
        mocks.tx.vehicleTripMileage.findUnique.mockResolvedValue(record());
        await finishVehicleMileage({ mileageId: 'm', odometerEnd: 150 }, 'u');
        expect(mocks.tx.vehicleTripMileage.update).not.toHaveBeenCalled();
        await expect(finishVehicleMileage({ mileageId: 'm', odometerEnd: 151 }, 'u')).rejects.toThrow('Koreksi');
    });
    it('rejects an end below the start and an unknown record', async () => {
        mocks.tx.vehicleTripMileage.findUnique.mockResolvedValue(open());
        await expect(finishVehicleMileage({ mileageId: 'm', odometerEnd: 99 }, 'u')).rejects.toThrow('lebih kecil');
        mocks.tx.vehicleTripMileage.findUnique.mockResolvedValue(null);
        await expect(finishVehicleMileage({ mileageId: 'x', odometerEnd: 99 }, 'u')).rejects.toThrow('tidak ditemukan');
    });
    it('fails when the record disappears between the unlocked and locked read', async () => {
        mocks.tx.vehicleTripMileage.findUnique.mockResolvedValueOnce({ vehicleId: 'v' }).mockResolvedValueOnce(null);
        await expect(finishVehicleMileage({ mileageId: 'm', odometerEnd: 200 }, 'u')).rejects.toThrow('tidak ditemukan');
    });
});

describe('correctVehicleMileage', () => {
    function neighbours(previous: unknown, next: unknown) {
        mocks.tx.vehicleTripMileage.findFirst.mockResolvedValueOnce(previous).mockResolvedValueOnce(next);
    }
    beforeEach(() => { mocks.tx.vehicleTripMileage.findUnique.mockResolvedValue(record()); });
    it('updates values within neighbours and audits old values, new values and reason', async () => {
        neighbours({ odometerEnd: '100' }, { odometerStart: '160' });
        await correctVehicleMileage(correction(), 'u');
        expect(mocks.tx.vehicleTripMileage.update).toHaveBeenCalledWith({
            where: { id: 'm' },
            data: { driverName: 'Sopir A', odometerStart: 100, odometerEnd: 160, returnedAt: new Date('2026-11-06T08:00:00Z') },
        });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
            tx: mocks.tx, entityType: 'VehicleTripMileage', entityId: 'm', action: 'CORRECT_VEHICLE_MILEAGE',
            changes: {
                vehicleId: 'v', reason: 'salah ketik',
                oldValues: { driverName: 'Sopir A', odometerStart: 100, odometerEnd: 150 },
                newValues: { driverName: 'Sopir A', odometerStart: 100, odometerEnd: 160 },
            },
        }));
        expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1);
    });
    it('rejects a start below the previous record end', async () => {
        neighbours({ odometerEnd: '100' }, null);
        await expect(correctVehicleMileage(correction({ odometerStart: 99 }), 'u')).rejects.toThrow('di bawah');
        expect(mocks.tx.vehicleTripMileage.update).not.toHaveBeenCalled();
        expect(mocks.audit).not.toHaveBeenCalled();
    });
    it('rejects an end above the next record start', async () => {
        neighbours(null, { odometerStart: '150' });
        await expect(correctVehicleMileage(correction({ odometerEnd: 151 }), 'u')).rejects.toThrow('perjalanan berikutnya');
        expect(mocks.tx.vehicleTripMileage.update).not.toHaveBeenCalled();
    });
    it('rejects an end below the start', async () => {
        neighbours(null, null);
        await expect(correctVehicleMileage(correction({ odometerEnd: 99 }), 'u')).rejects.toThrow('lebih kecil');
    });
    it('does not let a correction reopen a closed record', async () => {
        await expect(correctVehicleMileage(correction({ odometerEnd: null }), 'u')).rejects.toThrow('dibuka kembali');
        expect(mocks.tx.vehicleTripMileage.update).not.toHaveBeenCalled();
    });
    it('keeps an open record open and clears no return time', async () => {
        mocks.tx.vehicleTripMileage.findUnique.mockResolvedValue(record({ odometerEnd: null, returnedAt: null }));
        neighbours({ odometerEnd: '90' }, null);
        await correctVehicleMileage(correction({ odometerEnd: null, odometerStart: 95 }), 'u');
        expect(mocks.tx.vehicleTripMileage.update).toHaveBeenCalledWith({
            where: { id: 'm' }, data: { driverName: 'Sopir A', odometerStart: 95, odometerEnd: null, returnedAt: null },
        });
    });
    it('stamps a return time when a correction closes an open record', async () => {
        mocks.tx.vehicleTripMileage.findUnique.mockResolvedValue(record({ odometerEnd: null, returnedAt: null }));
        neighbours(null, null);
        await correctVehicleMileage(correction(), 'u');
        expect(mocks.tx.vehicleTripMileage.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ returnedAt: expect.any(Date) }) }));
    });
    it('rejects a no-op correction, a missing reason and an unknown record', async () => {
        neighbours(null, null);
        await expect(correctVehicleMileage(correction({ odometerEnd: 150 }), 'u')).rejects.toThrow('Tidak ada perubahan');
        await expect(correctVehicleMileage(correction({ reason: 'abc' }), 'u')).rejects.toThrow('Alasan');
        mocks.tx.vehicleTripMileage.findUnique.mockResolvedValue(null);
        await expect(correctVehicleMileage(correction(), 'u')).rejects.toThrow('tidak ditemukan');
    });
    it('allows correcting a record whose vehicle is no longer active or factory', async () => {
        neighbours(null, null);
        mocks.tx.vehicle.findUnique.mockResolvedValue({ ...factoryVehicle(), status: 'INACTIVE' });
        await expect(correctVehicleMileage(correction(), 'u')).resolves.toEqual({ mileageId: 'm', vehicleId: 'v' });
    });
});

describe('listFleetMileageBoard', () => {
    const now = new Date('2026-11-07T03:00:00Z');
    const vehicle = (overrides: Record<string, unknown> = {}) => ({
        id: 'v', plateNumber: 'B 1234 XY', name: 'Truk A', driverName: 'Sopir A', tripMileages: [], deliveryOrders: [], ...overrides,
    });
    it('queries only active factory trucks with Jakarta day boundaries for today deliveries', async () => {
        mocks.vehicles.mockResolvedValue([]);
        await listFleetMileageBoard(now);
        expect(mocks.vehicles).toHaveBeenCalledWith(expect.objectContaining({
            where: { ownershipType: 'FACTORY', status: 'ACTIVE' },
            select: expect.objectContaining({ deliveryOrders: expect.objectContaining({
                where: { deliveryDate: { gte: new Date('2026-11-06T17:00:00Z'), lt: new Date('2026-11-07T17:00:00Z') }, status: { not: 'CANCELLED' } },
            }) }),
        }));
    });
    it('shows a parked truck with last closed reading and todays delivery notes', async () => {
        mocks.vehicles.mockResolvedValue([vehicle({
            tripMileages: [record()],
            deliveryOrders: [{ id: 'd1', orderNumber: 'SJ-1', salesOrder: { customer: { name: 'Customer A' } } }, { id: 'd2', orderNumber: 'SJ-2', salesOrder: { customer: null } }],
        })]);
        const [card] = await listFleetMileageBoard(now);
        expect(card).toMatchObject({
            vehicleId: 'v', defaultDriver: 'Sopir A', lastOdometerEnd: 150, isOpen: false, isStale: false,
            latest: { id: 'm', odometerStart: 100, odometerEnd: 150 },
            todayDeliveries: [{ id: 'd1', orderNumber: 'SJ-1', customerName: 'Customer A' }, { id: 'd2', orderNumber: 'SJ-2', customerName: null }],
        });
    });
    it('uses the previous closed record for last reading when the newest one is open, and flags stale open ones', async () => {
        const open = record({ id: 'o', odometerStart: '150', odometerEnd: null, returnedAt: null, startedAt: new Date('2026-11-05T01:00:00Z') });
        mocks.vehicles.mockResolvedValue([vehicle({ tripMileages: [open, record()] }), vehicle({ id: 'v2', tripMileages: [record({ id: 'o2', odometerEnd: null, returnedAt: null, startedAt: new Date('2026-11-07T01:00:00Z') })] })]);
        const [stale, fresh] = await listFleetMileageBoard(now);
        expect(stale).toMatchObject({ isOpen: true, isStale: true, lastOdometerEnd: 150, latest: { id: 'o', odometerEnd: null } });
        expect(fresh).toMatchObject({ isOpen: true, isStale: false, lastOdometerEnd: null });
    });
    it('represents a truck without any record', async () => {
        mocks.vehicles.mockResolvedValue([vehicle({ driverName: null })]);
        const [card] = await listFleetMileageBoard(now);
        expect(card).toMatchObject({ latest: null, lastOdometerEnd: null, isOpen: false, defaultDriver: null });
    });
});
