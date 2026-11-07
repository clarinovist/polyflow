import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { parseDistanceInput } from '@/lib/sales/trip-distance';
import {
    assertServicedAtNotFuture, computeServiceStatus, correctVehicleServiceSchema, createServiceItemSchema, defaultWarnKm,
    describeServiceRemaining, isServiceAlert, recordVehicleServiceSchema, updateServiceItemSchema, validateServiceChain,
    type ServiceDueBy, type ServiceStatus,
} from '@/lib/sales/vehicle-service';
import { tripDistanceDb } from './trip-distance-service';

type Tx = Prisma.TransactionClient;
const MILEAGE_NEWEST = [{ startedAt: 'desc' }, { id: 'desc' }] satisfies Prisma.VehicleTripMileageOrderByWithRelationInput[];
// Same-day records are unordered, so the highest km of the latest date is the baseline (it is the global maximum).
const RECORD_NEWEST = [{ servicedAt: 'desc' }, { odometerKm: 'desc' }, { id: 'desc' }] satisfies Prisma.VehicleServiceRecordOrderByWithRelationInput[];
const FACTORY_ONLY_MESSAGE = 'Pengingat servis hanya untuk mobil pabrik.';
const toNumber = (value: Prisma.Decimal | number | null) => (value === null ? null : Number(value));

export interface ServiceRecordView { id: string; servicedAt: string; odometerKm: number; note: string | null }
export interface ServiceItemView {
    id: string; label: string; intervalKm: number; intervalDays: number | null; warnKm: number; isActive: boolean;
    status: ServiceStatus; dueBy: ServiceDueBy | null; currentKm: number | null; dueKm: number | null;
    remainingKm: number | null; remainingDays: number | null; dueDate: string | null; remainingText: string | null;
    /** Pre-filled km for "Catat servis": the best known current km. */
    suggestedKm: number | null;
    records: ServiceRecordView[];
}
export interface VehicleServiceView {
    vehicleId: string; ownershipType: string; vehicleStatus: string; latestMileageKm: number | null; items: ServiceItemView[];
}
export interface FleetServiceAlert {
    vehicleId: string; plateNumber: string;
    items: { itemId: string; label: string; status: ServiceStatus; dueBy: ServiceDueBy | null; remainingText: string | null }[];
}

type ItemRow = Prisma.VehicleServiceItemGetPayload<{ include: { records: true } }>;
const readingOf = (mileage: { odometerStart: Prisma.Decimal; odometerEnd: Prisma.Decimal | null } | undefined) =>
    mileage ? Number(mileage.odometerEnd ?? mileage.odometerStart) : null;

function buildItemView(item: ItemRow, latestMileageKm: number | null, now: Date): ServiceItemView {
    const records = [...item.records].sort((a, b) =>
        b.servicedAt.getTime() - a.servicedAt.getTime() || Number(b.odometerKm) - Number(a.odometerKm) || b.id.localeCompare(a.id));
    const [newest] = records;
    const terms = { intervalKm: Number(item.intervalKm), intervalDays: item.intervalDays, warnKm: Number(item.warnKm) };
    const result = computeServiceStatus({
        item: terms, latestMileageKm, now,
        lastService: newest ? { servicedAt: newest.servicedAt, odometerKm: Number(newest.odometerKm) } : null,
    });
    return {
        id: item.id, label: item.label, ...terms, isActive: item.isActive,
        status: result.status, dueBy: result.dueBy, currentKm: result.currentKm, dueKm: result.dueKm,
        remainingKm: result.remainingKm, remainingDays: result.remainingDays, dueDate: result.dueDate?.toISOString() ?? null,
        remainingText: describeServiceRemaining(result), suggestedKm: result.currentKm ?? latestMileageKm,
        records: records.map((record) => ({
            id: record.id, servicedAt: record.servicedAt.toISOString(), odometerKm: Number(record.odometerKm), note: record.note,
        })),
    };
}

export async function listVehicleServiceStatus(vehicleId: string, now = new Date()): Promise<VehicleServiceView> {
    const vehicle = await tripDistanceDb().vehicle.findUnique({
        where: { id: vehicleId },
        select: {
            id: true, ownershipType: true, status: true,
            tripMileages: { orderBy: MILEAGE_NEWEST, take: 1, select: { odometerStart: true, odometerEnd: true } },
            serviceItems: { orderBy: [{ isActive: 'desc' }, { label: 'asc' }], include: { records: true } },
        },
    });
    if (!vehicle) throw new NotFoundError('Kendaraan', vehicleId);
    const latestMileageKm = readingOf(vehicle.tripMileages[0]);
    return {
        vehicleId: vehicle.id, ownershipType: vehicle.ownershipType, vehicleStatus: vehicle.status, latestMileageKm,
        items: vehicle.serviceItems.map((item) => buildItemView(item, latestMileageKm, now)),
    };
}

/** ACTIVE factory trucks with at least one active item that is SEGERA or LEWAT. */
export async function listFleetServiceAlerts(now = new Date()): Promise<FleetServiceAlert[]> {
    const vehicles = await tripDistanceDb().vehicle.findMany({
        where: { ownershipType: 'FACTORY', status: 'ACTIVE' },
        orderBy: { plateNumber: 'asc' },
        select: {
            id: true, plateNumber: true,
            tripMileages: { orderBy: MILEAGE_NEWEST, take: 1, select: { odometerStart: true, odometerEnd: true } },
            serviceItems: {
                where: { isActive: true }, orderBy: { label: 'asc' },
                include: { records: { orderBy: RECORD_NEWEST, take: 1 } },
            },
        },
    });
    return vehicles.flatMap((vehicle) => {
        const latestMileageKm = readingOf(vehicle.tripMileages[0]);
        const items = vehicle.serviceItems
            .map((item) => buildItemView(item, latestMileageKm, now))
            .filter((view) => isServiceAlert(view.status))
            .map((view) => ({ itemId: view.id, label: view.label, status: view.status, dueBy: view.dueBy, remainingText: view.remainingText }));
        return items.length ? [{ vehicleId: vehicle.id, plateNumber: vehicle.plateNumber, items }] : [];
    });
}

async function lockVehicle(tx: Tx, vehicleId: string) {
    await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${vehicleId} FOR UPDATE`;
}
async function requireFactoryVehicle(tx: Tx, vehicleId: string, mustBeActive: boolean) {
    const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, ownershipType: true, status: true } });
    if (!vehicle) throw new NotFoundError('Kendaraan', vehicleId);
    if (vehicle.ownershipType !== 'FACTORY') throw new BusinessRuleError(FACTORY_ONLY_MESSAGE);
    if (mustBeActive && vehicle.status !== 'ACTIVE') throw new BusinessRuleError('Jenis servis baru hanya untuk mobil pabrik yang aktif.');
    return vehicle;
}
/** Locks the owning vehicle row first, then re-reads the item so later checks see committed state. */
async function lockedItem(tx: Tx, itemId: string) {
    const found = await tx.vehicleServiceItem.findUnique({ where: { id: itemId }, select: { vehicleId: true } });
    if (!found) throw new NotFoundError('Jenis servis', itemId);
    await lockVehicle(tx, found.vehicleId);
    const item = await tx.vehicleServiceItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundError('Jenis servis', itemId);
    return item;
}
async function lockedRecord(tx: Tx, recordId: string) {
    const found = await tx.vehicleServiceRecord.findUnique({ where: { id: recordId }, select: { vehicleId: true } });
    if (!found) throw new NotFoundError('Catatan servis', recordId);
    await lockVehicle(tx, found.vehicleId);
    const record = await tx.vehicleServiceRecord.findUnique({ where: { id: recordId }, include: { serviceItem: { select: { label: true } } } });
    if (!record) throw new NotFoundError('Catatan servis', recordId);
    return record;
}
async function audit(tx: Tx, userId: string, entityType: string, entityId: string, action: string, changes: Record<string, unknown>) {
    await logActivity({ tx, userId, entityType, entityId, action, changes });
}

export async function createServiceItem(raw: unknown, userId: string) {
    const input = parseDistanceInput(createServiceItemSchema, raw);
    return tripDistanceDb().$transaction(async (tx) => {
        await lockVehicle(tx, input.vehicleId);
        await requireFactoryVehicle(tx, input.vehicleId, true);
        const duplicate = await tx.vehicleServiceItem.findFirst({
            where: { vehicleId: input.vehicleId, label: { equals: input.label, mode: 'insensitive' } }, select: { id: true },
        });
        if (duplicate) throw new BusinessRuleError(`Jenis servis "${input.label}" sudah ada untuk truk ini.`);
        const warnKm = input.warnKm ?? defaultWarnKm(input.intervalKm);
        const created = await tx.vehicleServiceItem.create({
            data: { vehicleId: input.vehicleId, label: input.label, intervalKm: input.intervalKm, intervalDays: input.intervalDays, warnKm },
        });
        await audit(tx, userId, 'VehicleServiceItem', created.id, 'CREATE_SERVICE_ITEM', {
            vehicleId: input.vehicleId, label: input.label, intervalKm: input.intervalKm, intervalDays: input.intervalDays, warnKm,
        });
        return { itemId: created.id, vehicleId: input.vehicleId };
    });
}

export async function updateServiceItem(raw: unknown, userId: string) {
    const input = parseDistanceInput(updateServiceItemSchema, raw);
    return tripDistanceDb().$transaction(async (tx) => {
        const item = await lockedItem(tx, input.itemId);
        await requireFactoryVehicle(tx, item.vehicleId, false);
        const oldValues = { intervalKm: Number(item.intervalKm), intervalDays: item.intervalDays, warnKm: Number(item.warnKm), isActive: item.isActive };
        const newValues = {
            intervalKm: input.intervalKm, intervalDays: input.intervalDays,
            warnKm: input.warnKm ?? defaultWarnKm(input.intervalKm), isActive: input.isActive ?? item.isActive,
        };
        if (JSON.stringify(oldValues) === JSON.stringify(newValues)) throw new BusinessRuleError('Tidak ada perubahan untuk disimpan.');
        await tx.vehicleServiceItem.update({ where: { id: item.id }, data: newValues });
        await audit(tx, userId, 'VehicleServiceItem', item.id, 'UPDATE_SERVICE_ITEM', { vehicleId: item.vehicleId, label: item.label, oldValues, newValues });
        return { itemId: item.id, vehicleId: item.vehicleId };
    });
}

/**
 * Chain bounds within one item: the highest km on any earlier date and the lowest km on any later date.
 * Service dates have day granularity, so records on the same date are deliberately unordered (an id tiebreak
 * would be arbitrary) and never conflict with each other; the outer bounds still hold for the whole group.
 */
async function serviceBounds(tx: Tx, serviceItemId: string, servicedAt: Date, selfId: string | null) {
    const base = { serviceItemId, ...(selfId ? { id: { not: selfId } } : {}) };
    const [earlier, later] = await Promise.all([
        tx.vehicleServiceRecord.aggregate({ where: { ...base, servicedAt: { lt: servicedAt } }, _max: { odometerKm: true } }),
        tx.vehicleServiceRecord.aggregate({ where: { ...base, servicedAt: { gt: servicedAt } }, _min: { odometerKm: true } }),
    ]);
    return { previousKm: toNumber(earlier._max.odometerKm), nextKm: toNumber(later._min.odometerKm) };
}

export async function recordVehicleService(raw: unknown, userId: string, now = new Date()) {
    const input = parseDistanceInput(recordVehicleServiceSchema, raw);
    assertServicedAtNotFuture(input.servicedAt, now);
    return tripDistanceDb().$transaction(async (tx) => {
        await lockVehicle(tx, input.vehicleId);
        await requireFactoryVehicle(tx, input.vehicleId, false);
        const item = await tx.vehicleServiceItem.findUnique({ where: { id: input.serviceItemId } });
        if (!item) throw new NotFoundError('Jenis servis', input.serviceItemId);
        if (item.vehicleId !== input.vehicleId) throw new BusinessRuleError('Jenis servis ini bukan milik kendaraan yang dipilih.');
        if (!item.isActive) throw new BusinessRuleError('Jenis servis ini sudah dinonaktifkan.');
        validateServiceChain({ odometerKm: input.odometerKm, ...(await serviceBounds(tx, item.id, input.servicedAt, null)) });
        const created = await tx.vehicleServiceRecord.create({
            data: { serviceItemId: item.id, vehicleId: item.vehicleId, servicedAt: input.servicedAt, odometerKm: input.odometerKm, note: input.note },
        });
        await audit(tx, userId, 'VehicleServiceRecord', created.id, 'RECORD_VEHICLE_SERVICE', {
            vehicleId: item.vehicleId, serviceItemId: item.id, label: item.label,
            servicedAt: input.servicedAt.toISOString(), odometerKm: input.odometerKm, note: input.note ?? null,
        });
        return { recordId: created.id, vehicleId: item.vehicleId };
    });
}

export async function correctVehicleService(raw: unknown, userId: string, now = new Date()) {
    const input = parseDistanceInput(correctVehicleServiceSchema, raw);
    assertServicedAtNotFuture(input.servicedAt, now);
    return tripDistanceDb().$transaction(async (tx) => {
        const record = await lockedRecord(tx, input.recordId);
        await requireFactoryVehicle(tx, record.vehicleId, false);
        const oldValues = { servicedAt: record.servicedAt.toISOString(), odometerKm: Number(record.odometerKm), note: record.note };
        const newValues = { servicedAt: input.servicedAt.toISOString(), odometerKm: input.odometerKm, note: input.note ?? null };
        if (JSON.stringify(oldValues) === JSON.stringify(newValues)) throw new BusinessRuleError('Tidak ada perubahan untuk dikoreksi.');
        validateServiceChain({ odometerKm: input.odometerKm, ...(await serviceBounds(tx, record.serviceItemId, input.servicedAt, record.id)) });
        await tx.vehicleServiceRecord.update({
            where: { id: record.id }, data: { servicedAt: input.servicedAt, odometerKm: input.odometerKm, note: newValues.note },
        });
        await audit(tx, userId, 'VehicleServiceRecord', record.id, 'CORRECT_VEHICLE_SERVICE', {
            vehicleId: record.vehicleId, serviceItemId: record.serviceItemId, label: record.serviceItem.label,
            oldValues, newValues, reason: input.reason,
        });
        return { recordId: record.id, vehicleId: record.vehicleId };
    });
}
