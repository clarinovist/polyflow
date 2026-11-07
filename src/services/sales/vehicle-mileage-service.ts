import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { actualTripDistance, parseDistanceInput } from '@/lib/sales/trip-distance';
import {
    assertOdometerNotBelowPrevious, correctVehicleMileageSchema, finishVehicleMileageSchema,
    isOpenMileageStale, startVehicleMileageSchema, validateCorrectionChain, wibDayRange,
} from '@/lib/sales/vehicle-mileage';
import { tripDistanceDb } from './trip-distance-service';

type Tx = Prisma.TransactionClient;
const CHAIN_ORDER = [{ startedAt: 'desc' }, { id: 'desc' }] satisfies Prisma.VehicleTripMileageOrderByWithRelationInput[];
const toNumber = (value: Prisma.Decimal | number | null) => (value === null ? null : Number(value));

export interface MileageBoardCard {
    vehicleId: string;
    plateNumber: string;
    name: string;
    defaultDriver: string | null;
    lastOdometerEnd: number | null;
    latest: { id: string; driverName: string; odometerStart: number; odometerEnd: number | null; startedAt: string; note: string | null } | null;
    isOpen: boolean;
    isStale: boolean;
    todayDeliveries: { id: string; orderNumber: string; customerName: string | null }[];
}

/** One card per ACTIVE factory truck. Today is the Asia/Jakarta calendar day. */
export async function listFleetMileageBoard(now = new Date()): Promise<MileageBoardCard[]> {
    const vehicles = await tripDistanceDb().vehicle.findMany({
        where: { ownershipType: 'FACTORY', status: 'ACTIVE' },
        orderBy: { plateNumber: 'asc' },
        select: {
            id: true, plateNumber: true, name: true, driverName: true,
            // Two newest records are enough: an open record is always the newest one.
            tripMileages: { orderBy: CHAIN_ORDER, take: 2 },
            deliveryOrders: {
                where: { deliveryDate: wibDayRange(now), status: { not: 'CANCELLED' } },
                orderBy: { orderNumber: 'asc' },
                select: { id: true, orderNumber: true, salesOrder: { select: { customer: { select: { name: true } } } } },
            },
        },
    });
    return vehicles.map((vehicle) => {
        const [latest] = vehicle.tripMileages;
        const lastClosed = vehicle.tripMileages.find((record) => record.odometerEnd !== null);
        const open = latest !== undefined && latest.odometerEnd === null ? latest : undefined;
        return {
            vehicleId: vehicle.id, plateNumber: vehicle.plateNumber, name: vehicle.name, defaultDriver: vehicle.driverName,
            lastOdometerEnd: toNumber(lastClosed?.odometerEnd ?? null),
            latest: latest ? {
                id: latest.id, driverName: latest.driverName, odometerStart: Number(latest.odometerStart),
                odometerEnd: toNumber(latest.odometerEnd), startedAt: latest.startedAt.toISOString(), note: latest.note,
            } : null,
            isOpen: open !== undefined, isStale: open !== undefined && isOpenMileageStale(open.startedAt, now),
            todayDeliveries: vehicle.deliveryOrders.map((order) => ({
                id: order.id, orderNumber: order.orderNumber, customerName: order.salesOrder.customer?.name ?? null,
            })),
        };
    });
}

async function lockVehicle(tx: Tx, vehicleId: string) {
    await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${vehicleId} FOR UPDATE`;
}
/** Locks the owning vehicle row first, then re-reads the record so the chain checks see committed state. */
async function lockedMileage(tx: Tx, mileageId: string) {
    const found = await tx.vehicleTripMileage.findUnique({ where: { id: mileageId }, select: { vehicleId: true } });
    if (!found) throw new NotFoundError('Catatan KM', mileageId);
    await lockVehicle(tx, found.vehicleId);
    const record = await tx.vehicleTripMileage.findUnique({ where: { id: mileageId } });
    if (!record) throw new NotFoundError('Catatan KM', mileageId);
    return record;
}
async function audit(tx: Tx, userId: string, entityId: string, action: string, changes: Record<string, unknown>) {
    await logActivity({ tx, userId, entityType: 'VehicleTripMileage', entityId, action, changes });
}

export async function startVehicleMileage(raw: unknown, userId: string) {
    const input = parseDistanceInput(startVehicleMileageSchema, raw);
    return tripDistanceDb().$transaction(async (tx) => {
        await lockVehicle(tx, input.vehicleId);
        const vehicle = await tx.vehicle.findUnique({ where: { id: input.vehicleId }, select: { id: true, ownershipType: true, status: true } });
        if (!vehicle) throw new NotFoundError('Kendaraan', input.vehicleId);
        if (vehicle.ownershipType !== 'FACTORY' || vehicle.status !== 'ACTIVE') {
            throw new BusinessRuleError('Pencatatan KM hanya untuk mobil pabrik yang aktif.');
        }
        const latest = await tx.vehicleTripMileage.findFirst({ where: { vehicleId: vehicle.id }, orderBy: CHAIN_ORDER });
        if (latest && latest.odometerEnd === null) {
            throw new BusinessRuleError('Lengkapi odometer kembali perjalanan sebelumnya untuk mobil ini terlebih dahulu.');
        }
        assertOdometerNotBelowPrevious(input.odometerStart, toNumber(latest?.odometerEnd ?? null));
        const created = await tx.vehicleTripMileage.create({
            data: { vehicleId: vehicle.id, driverName: input.driverName, odometerStart: input.odometerStart, note: input.note },
        });
        await audit(tx, userId, created.id, 'START_VEHICLE_MILEAGE', {
            vehicleId: vehicle.id, driverName: input.driverName, odometerStart: input.odometerStart, note: input.note ?? null,
        });
        return { mileageId: created.id, vehicleId: vehicle.id };
    });
}

export async function finishVehicleMileage(raw: unknown, userId: string) {
    const input = parseDistanceInput(finishVehicleMileageSchema, raw);
    return tripDistanceDb().$transaction(async (tx) => {
        const record = await lockedMileage(tx, input.mileageId);
        const result = { mileageId: record.id, vehicleId: record.vehicleId };
        if (record.odometerEnd !== null) {
            if (Number(record.odometerEnd) === input.odometerEnd) return result;
            throw new BusinessRuleError('Odometer kembali sudah tercatat; gunakan Koreksi untuk mengubahnya.');
        }
        const actualDistanceKm = actualTripDistance(Number(record.odometerStart), input.odometerEnd);
        await tx.vehicleTripMileage.update({ where: { id: record.id }, data: { odometerEnd: input.odometerEnd, returnedAt: new Date() } });
        await audit(tx, userId, record.id, 'FINISH_VEHICLE_MILEAGE', { vehicleId: record.vehicleId, odometerEnd: input.odometerEnd, actualDistanceKm });
        return result;
    });
}

type MileageRecord = NonNullable<Awaited<ReturnType<Tx['vehicleTripMileage']['findUnique']>>>;
async function chainNeighbours(tx: Tx, record: MileageRecord) {
    const base = { vehicleId: record.vehicleId, id: { not: record.id } };
    const [previous, next] = await Promise.all([
        tx.vehicleTripMileage.findFirst({
            where: { ...base, OR: [{ startedAt: { lt: record.startedAt } }, { startedAt: record.startedAt, id: { lt: record.id } }] },
            orderBy: CHAIN_ORDER, select: { odometerEnd: true },
        }),
        tx.vehicleTripMileage.findFirst({
            where: { ...base, OR: [{ startedAt: { gt: record.startedAt } }, { startedAt: record.startedAt, id: { gt: record.id } }] },
            orderBy: [{ startedAt: 'asc' }, { id: 'asc' }], select: { odometerStart: true },
        }),
    ]);
    return { previousEnd: toNumber(previous?.odometerEnd ?? null), nextStart: toNumber(next?.odometerStart ?? null) };
}

export async function correctVehicleMileage(raw: unknown, userId: string) {
    const input = parseDistanceInput(correctVehicleMileageSchema, raw);
    return tripDistanceDb().$transaction(async (tx) => {
        const record = await lockedMileage(tx, input.mileageId);
        if (input.odometerEnd === null && record.odometerEnd !== null) {
            throw new BusinessRuleError('Catatan yang sudah ditutup tidak boleh dibuka kembali.');
        }
        const oldValues = { driverName: record.driverName, odometerStart: Number(record.odometerStart), odometerEnd: toNumber(record.odometerEnd) };
        const newValues = { driverName: input.driverName, odometerStart: input.odometerStart, odometerEnd: input.odometerEnd };
        if (JSON.stringify(oldValues) === JSON.stringify(newValues)) throw new BusinessRuleError('Tidak ada perubahan untuk dikoreksi.');
        validateCorrectionChain({ ...newValues, ...(await chainNeighbours(tx, record)) });
        await tx.vehicleTripMileage.update({
            where: { id: record.id },
            data: { ...newValues, returnedAt: newValues.odometerEnd === null ? null : record.returnedAt ?? new Date() },
        });
        await audit(tx, userId, record.id, 'CORRECT_VEHICLE_MILEAGE', { vehicleId: record.vehicleId, oldValues, newValues, reason: input.reason });
        return { mileageId: record.id, vehicleId: record.vehicleId };
    });
}
