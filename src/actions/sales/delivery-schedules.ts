'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction, BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { computeDeliveryTotals } from '@/lib/sales/delivery-pricing';
import { ScheduleStatus, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';

/**
 * Generate schedule number: JADWAL-YYYY-WXX
 */
function generateScheduleNumber(date: Date): string {
  const year = date.getFullYear();
  // ISO week number calculation
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `JADWAL-${year}-W${weekNo.toString().padStart(2, '0')}`;
}

/**
 * Get Monday and Sunday of current week.
 */
function getWeekBounds(date: Date): { monday: Date; sunday: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

/**
 * List all delivery schedules with vehicle and order counts.
 */
export const getDeliverySchedules = withTenant(
  async function getDeliverySchedules(filters?: { status?: string; year?: number }) {
    return safeAction(async () => {
      const where: Prisma.DeliveryScheduleWhereInput = {};
      if (filters?.status) where.status = filters.status as ScheduleStatus;
      if (filters?.year) {
        where.weekStart = { gte: new Date(`${filters.year}-01-01`) };
      }

      return prisma.deliverySchedule.findMany({
        where,
        include: {
          vehicles: {
            include: {
              vehicle: { select: { id: true, plateNumber: true, name: true, driverName: true } },
              orders: { select: { id: true } },
            },
          },
          createdBy: { select: { name: true } },
        },
        orderBy: { weekStart: 'desc' },
      });
    });
  }
);

/**
 * Get single delivery schedule with full details.
 */
export const getDeliverySchedule = withTenant(
  async function getDeliverySchedule(id: string) {
    return safeAction(async () => {
      const schedule = await prisma.deliverySchedule.findUnique({
        where: { id },
        include: {
          vehicles: {
            include: {
              vehicle: true,
              orders: {
                include: {
                  deliveryOrder: {
                    include: {
                      salesOrder: {
                        include: {
                          customer: { select: { id: true, name: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          createdBy: { select: { name: true } },
        },
      });
      if (!schedule) throw new NotFoundError("Jadwal Kirim", id);
      return schedule;
    });
  }
);

/**
 * Create a new weekly delivery schedule.
 */
export const createDeliverySchedule = withTenant(
  async function createDeliverySchedule(data?: { weekStart?: Date; weekEnd?: Date; notes?: string }) {
    return safeAction(async () => {
      await requireAuth();

      const now = data?.weekStart || new Date();
      const { monday, sunday } = getWeekBounds(now);

      // Check for duplicate schedule in same week
      const existing = await prisma.deliverySchedule.findFirst({
        where: {
          weekStart: { lte: sunday },
          weekEnd: { gte: monday },
        },
      });
      if (existing) {
        throw new BusinessRuleError(
          `Sudah ada jadwal untuk minggu ini (${existing.scheduleNumber}). Edit jadwal yang sudah ada atau pilih minggu lain.`
        );
      }

      const scheduleNumber = generateScheduleNumber(monday);

      const schedule = await prisma.deliverySchedule.create({
        data: {
          scheduleNumber,
          weekStart: monday,
          weekEnd: sunday,
          status: 'DRAFT',
          notes: data?.notes || null,
        },
      });

      revalidatePath('/sales/delivery-schedules');
      return schedule;
    });
  }
);

/**
 * Update schedule status.
 */
export const updateDeliverySchedule = withTenant(
  async function updateDeliverySchedule(id: string, data: { status?: ScheduleStatus; notes?: string }) {
    return safeAction(async () => {
      await requireAuth();

      const schedule = await prisma.deliverySchedule.findUnique({ where: { id } });
      if (!schedule) throw new NotFoundError("Jadwal Kirim", id);

      const updated = await prisma.deliverySchedule.update({
        where: { id },
        data: {
          ...(data.status && { status: data.status }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
      });

      revalidatePath('/sales/delivery-schedules');
      revalidatePath(`/sales/delivery-schedules/${id}`);
      return updated;
    });
  }
);

/**
 * Assign a vehicle to a schedule.
 */
export const assignVehicleToSchedule = withTenant(
  async function assignVehicleToSchedule(scheduleId: string, vehicleId: string) {
    return safeAction(async () => {
      await requireAuth();

      const schedule = await prisma.deliverySchedule.findUnique({ where: { id: scheduleId } });
      if (!schedule) throw new NotFoundError("Jadwal Kirim", scheduleId);

      const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
      if (!vehicle) throw new NotFoundError("Kendaraan", vehicleId);
      if (vehicle.status !== 'ACTIVE') {
        throw new BusinessRuleError(`Kendaraan "${vehicle.plateNumber}" tidak aktif.`);
      }

      // Check duplicate assignment
      const existing = await prisma.deliveryScheduleVehicle.findUnique({
        where: { scheduleId_vehicleId: { scheduleId, vehicleId } },
      });
      if (existing) {
        throw new BusinessRuleError(`Kendaraan "${vehicle.plateNumber}" sudah ditugaskan ke jadwal ini.`);
      }

      const assigned = await prisma.deliveryScheduleVehicle.create({
        data: {
          scheduleId,
          vehicleId,
        },
      });

      revalidatePath(`/sales/delivery-schedules/${scheduleId}`);
      return assigned;
    });
  }
);

/**
 * Remove a vehicle from a schedule (and its assigned orders).
 */
export const removeVehicleFromSchedule = withTenant(
  async function removeVehicleFromSchedule(scheduleVehicleId: string) {
    return safeAction(async () => {
      await requireAuth();

      const sv = await prisma.deliveryScheduleVehicle.findUnique({
        where: { id: scheduleVehicleId },
        include: { orders: true },
      });
      if (!sv) throw new NotFoundError("Penugasan Armada", scheduleVehicleId);

      // Delete orders first, then vehicle assignment
      await prisma.deliveryScheduleOrder.deleteMany({
        where: { scheduleVehicleId },
      });

      await prisma.deliveryScheduleVehicle.delete({
        where: { id: scheduleVehicleId },
      });

      revalidatePath(`/sales/delivery-schedules/${sv.scheduleId}`);
      return { success: true };
    });
  }
);

/**
 * Assign a delivery order to a schedule vehicle.
 * Auto-applies tariff from VehicleTariff if available.
 */
export const assignOrderToSchedule = withTenant(
  async function assignOrderToSchedule(scheduleVehicleId: string, deliveryOrderId: string) {
    return safeAction(async () => {
      await requireAuth();

      const sv = await prisma.deliveryScheduleVehicle.findUnique({
        where: { id: scheduleVehicleId },
        include: { vehicle: true, schedule: true },
      });
      if (!sv) throw new NotFoundError("Penugasan Armada", scheduleVehicleId);

      const doRecord = await prisma.deliveryOrder.findUnique({
        where: { id: deliveryOrderId },
        include: { salesOrder: true },
      });
      if (!doRecord) throw new NotFoundError("Surat Jalan", deliveryOrderId);

      // Check not already assigned to this schedule
      const existingOrder = await prisma.deliveryScheduleOrder.findUnique({
        where: { scheduleVehicleId_deliveryOrderId: { scheduleVehicleId, deliveryOrderId } },
      });
      if (existingOrder) {
        throw new BusinessRuleError(`Surat Jalan "${doRecord.orderNumber}" sudah dijadwalkan ke armada ini.`);
      }

      // Check schedule is in DRAFT status
      if (sv.schedule.status !== 'DRAFT') {
        throw new BusinessRuleError(`Jadwal "${sv.schedule.scheduleNumber}" sudah dikonfirmasi. Tidak bisa menambah DO.`);
      }

      // Auto-apply tariff from VehicleTariff (route-aware)
      const now = new Date();
      const routeKey = doRecord.appliedRouteName?.trim() || null;

      // Fetch all valid tariffs for this vehicle
      const candidates = await prisma.vehicleTariff.findMany({
        where: {
          vehicleId: sv.vehicleId,
          validFrom: { lte: now },
          OR: [
            { validUntil: null },
            { validUntil: { gte: now } },
          ],
        },
        orderBy: { validFrom: 'desc' },
      });

      // Priority: exact route match → "Semua Rute" (null) → null
      let tariff = null;
      if (routeKey) {
        tariff = candidates.find(
          (t) => t.routeName?.trim().toLowerCase() === routeKey.toLowerCase(),
        );
      }
      if (!tariff) {
        tariff = candidates.find((t) => !t.routeName || t.routeName.trim() === '');
      }
      if (!tariff) {
        tariff = candidates[0] ?? null;
      }

      const assigned = await prisma.deliveryScheduleOrder.create({
        data: {
          scheduleVehicleId,
          deliveryOrderId,
        },
      });

      // Update DO with vehicle + tariff snapshot + computed totals
      if (tariff) {
        const weight = doRecord.estimatedWeightKg
          ? Number(doRecord.estimatedWeightKg)
          : null;
        const { totalCost, totalCharge } = computeDeliveryTotals({
          rateType: tariff.rateType as 'PER_KG' | 'FLAT_RATE',
          costRate: Number(tariff.costRate),
          chargeRate: Number(tariff.chargeRate),
          weightKg: weight,
          minKg: tariff.minKg != null ? Number(tariff.minKg) : null,
        });

        await prisma.deliveryOrder.update({
          where: { id: deliveryOrderId },
          data: {
            vehicleId: sv.vehicleId,
            appliedRateType: tariff.rateType,
            appliedCostRate: tariff.costRate,
            appliedChargeRate: tariff.chargeRate,
            appliedRouteName: tariff.routeName ?? doRecord.appliedRouteName ?? null,
            totalCost,
            totalCharge,
          },
        });
      } else {
        await prisma.deliveryOrder.update({
          where: { id: deliveryOrderId },
          data: { vehicleId: sv.vehicleId },
        });
      }

      revalidatePath(`/sales/delivery-schedules/${sv.scheduleId}`);
      return assigned;
    });
  }
);

/**
 * Remove a delivery order from a schedule vehicle.
 */
export const removeOrderFromSchedule = withTenant(
  async function removeOrderFromSchedule(scheduleOrderId: string) {
    return safeAction(async () => {
      await requireAuth();

      const so = await prisma.deliveryScheduleOrder.findUnique({
        where: { id: scheduleOrderId },
      });
      if (!so) throw new NotFoundError("Penugasan DO", scheduleOrderId);

      await prisma.deliveryScheduleOrder.delete({
        where: { id: scheduleOrderId },
      });

      // Get the schedule ID for revalidation
      const sv = await prisma.deliveryScheduleVehicle.findUnique({
        where: { id: so.scheduleVehicleId },
      });

      if (sv) {
        revalidatePath(`/sales/delivery-schedules/${sv.scheduleId}`);
      }
      return { success: true };
    });
  }
);
