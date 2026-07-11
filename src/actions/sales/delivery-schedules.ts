'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction, BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { computeDeliveryTotals } from '@/lib/sales/delivery-pricing';
import {
  canTransitionSchedule,
  canActivateSchedule,
  canCloseSchedule,
  canTransitionTrip,
  canDepartTrip,
  validateDepartureInWeek,
  canRemoveTrip,
  isDuplicateTrip,
  isSOSchedulable,
  isDOAlreadyAssigned,
  validateStopHasSource,
} from '@/lib/sales/delivery-schedule-rules';
import { ScheduleStatus, TripStatus, RateType, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { createScheduleTripSchema, assignSalesOrderToTripSchema } from '@/lib/schemas/sales';

// ============================================
// Helpers
// ============================================

function generateScheduleNumber(date: Date): string {
  const year = date.getFullYear();
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `JADWAL-${year}-W${weekNo.toString().padStart(2, '0')}`;
}

function getWeekBounds(date: Date): { monday: Date; sunday: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

// ============================================
// Schedule Header (existing, updated)
// ============================================

/**
 * List all delivery schedules with trip and stop counts.
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
          trips: {
            include: {
              vehicle: { select: { id: true, plateNumber: true, name: true, driverName: true, capacityKg: true } },
              orders: { select: { id: true, status: true, deliveryOrderId: true } },
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
          trips: {
            include: {
              vehicle: true,
              orders: {
                include: {
                  salesOrder: {
                    include: {
                      customer: { select: { id: true, name: true } },
                      items: {
                        include: {
                          productVariant: { select: { id: true, name: true, skuCode: true, primaryUnit: true } },
                        },
                      },
                    },
                  },
                  deliveryOrder: {
                    include: {
                      salesOrder: {
                        include: {
                          customer: { select: { id: true, name: true } },
                          items: {
                            include: {
                              productVariant: { select: { id: true, name: true, skuCode: true, primaryUnit: true } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            orderBy: { sequence: 'asc' },
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
 * Update schedule header (status + notes).
 * Status transitions use normalized values with guard checks.
 */
export const updateDeliverySchedule = withTenant(
  async function updateDeliverySchedule(id: string, data: { status?: ScheduleStatus; notes?: string }) {
    return safeAction(async () => {
      await requireAuth();

      const schedule = await prisma.deliverySchedule.findUnique({
        where: { id },
        include: {
          trips: { select: { id: true, status: true } },
        },
      });
      if (!schedule) throw new NotFoundError("Jadwal Kirim", id);

      // Guard status transitions
      if (data.status && data.status !== schedule.status) {
        const transitionOk = canTransitionSchedule(schedule.status, data.status);
        if (!transitionOk) {
          throw new BusinessRuleError(
            `Tidak bisa mengubah status dari "${schedule.status}" ke "${data.status}".`
          );
        }

        // Additional guards
        if (data.status === 'ACTIVE' || data.status === 'CONFIRMED') {
          const guard = canActivateSchedule(schedule.trips.length);
          if (guard.warning) {
            // Soft warning — log but don't block
            console.warn(`[schedule] ${guard.warning}`);
          }
        }

        if (data.status === 'CLOSED' || data.status === 'COMPLETED') {
          const guard = canCloseSchedule(schedule.trips);
          if (!guard.ok) {
            throw new BusinessRuleError(guard.error!);
          }
        }
      }

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

// ============================================
// Trip Actions (new)
// ============================================

/**
 * Create a trip (evolved assignVehicleToSchedule).
 * Requires departureDate and optional routeName.
 */
export const createScheduleTrip = withTenant(
  async function createScheduleTrip(
    scheduleId: string,
    rawData: { vehicleId: string; departureDate: Date; routeName?: string; notes?: string }
  ) {
    return safeAction(async () => {
      await requireAuth();

      // Zod validation
      const parsed = createScheduleTripSchema.safeParse(rawData);
      if (!parsed.success) {
        throw new BusinessRuleError(parsed.error.issues.map((i) => i.message).join(', '));
      }
      const data = parsed.data;

      const schedule = await prisma.deliverySchedule.findUnique({ where: { id: scheduleId } });
      if (!schedule) throw new NotFoundError("Jadwal Kirim", scheduleId);

      const vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
      if (!vehicle) throw new NotFoundError("Kendaraan", data.vehicleId);
      if (vehicle.status !== 'ACTIVE') {
        throw new BusinessRuleError(`Kendaraan "${vehicle.plateNumber}" tidak aktif.`);
      }

      // R-T1: departureDate within week bounds
      const weekCheck = validateDepartureInWeek(data.departureDate, schedule.weekStart, schedule.weekEnd);
      if (!weekCheck.ok) {
        throw new BusinessRuleError(weekCheck.error!);
      }

      // R-T2: same vehicle + same date blocked
      const existingTrips = await prisma.deliveryScheduleVehicle.findMany({
        where: { scheduleId, status: { not: 'CANCELLED' } },
        select: { vehicleId: true, departureDate: true, status: true },
      });
      const dupeCheck = isDuplicateTrip(data.vehicleId, data.departureDate, existingTrips);
      if (dupeCheck.blocked) {
        throw new BusinessRuleError(dupeCheck.conflictTrip!);
      }

      // Default sequence = max + 1
      const maxSeq = await prisma.deliveryScheduleVehicle.aggregate({
        where: { scheduleId },
        _max: { sequence: true },
      });

      const trip = await prisma.deliveryScheduleVehicle.create({
        data: {
          scheduleId,
          vehicleId: data.vehicleId,
          departureDate: data.departureDate,
          routeName: data.routeName || null,
          notes: data.notes || null,
          sequence: (maxSeq._max.sequence ?? -1) + 1,
          status: 'PLANNED',
        },
      });

      revalidatePath(`/sales/delivery-schedules/${scheduleId}`);
      return trip;
    });
  }
);

/**
 * Update trip details (only when PLANNED).
 */
export const updateScheduleTrip = withTenant(
  async function updateScheduleTrip(
    tripId: string,
    data: { departureDate?: Date; routeName?: string; notes?: string; sequence?: number }
  ) {
    return safeAction(async () => {
      await requireAuth();

      const trip = await prisma.deliveryScheduleVehicle.findUnique({
        where: { id: tripId },
        include: { schedule: true },
      });
      if (!trip) throw new NotFoundError("Trip", tripId);

      if (trip.status !== 'PLANNED') {
        throw new BusinessRuleError(`Hanya trip dengan status "Direncanakan" yang bisa diedit.`);
      }

      // If changing departureDate, validate within week + duplicate check
      if (data.departureDate) {
        const weekCheck = validateDepartureInWeek(data.departureDate, trip.schedule.weekStart, trip.schedule.weekEnd);
        if (!weekCheck.ok) {
          throw new BusinessRuleError(weekCheck.error!);
        }

        // R-T2: re-check same vehicle + same date
        const existingTrips = await prisma.deliveryScheduleVehicle.findMany({
          where: { scheduleId: trip.scheduleId, status: { not: 'CANCELLED' }, id: { not: tripId } },
          select: { vehicleId: true, departureDate: true, status: true },
        });
        const dupeCheck = isDuplicateTrip(trip.vehicleId, data.departureDate, existingTrips);
        if (dupeCheck.blocked) {
          throw new BusinessRuleError(dupeCheck.conflictTrip!);
        }
      }

      const updated = await prisma.deliveryScheduleVehicle.update({
        where: { id: tripId },
        data: {
          ...(data.departureDate && { departureDate: data.departureDate }),
          ...(data.routeName !== undefined && { routeName: data.routeName }),
          ...(data.notes !== undefined && { notes: data.notes }),
          ...(data.sequence !== undefined && { sequence: data.sequence }),
        },
      });

      revalidatePath(`/sales/delivery-schedules/${trip.scheduleId}`);
      return updated;
    });
  }
);

/**
 * Update trip status with guard checks.
 */
export const updateTripStatus = withTenant(
  async function updateTripStatus(tripId: string, newStatus: TripStatus) {
    return safeAction(async () => {
      await requireAuth();

      const trip = await prisma.deliveryScheduleVehicle.findUnique({
        where: { id: tripId },
        include: {
          schedule: true,
          orders: { select: { id: true, status: true, deliveryOrderId: true } },
        },
      });
      if (!trip) throw new NotFoundError("Trip", tripId);

      // Guard transition
      if (!canTransitionTrip(trip.status, newStatus)) {
        throw new BusinessRuleError(
          `Tidak bisa mengubah status trip dari "${trip.status}" ke "${newStatus}".`
        );
      }

      // Guard DEPARTED: all stops must have DO
      if (newStatus === 'DEPARTED') {
        const departCheck = canDepartTrip(trip.orders);
        if (!departCheck.ok) {
          throw new BusinessRuleError(departCheck.error!);
        }
      }

      // Guard CONFIRMED: departureDate must be set
      if (newStatus === 'CONFIRMED') {
        const weekCheck = validateDepartureInWeek(trip.departureDate, trip.schedule.weekStart, trip.schedule.weekEnd);
        if (!weekCheck.ok) {
          throw new BusinessRuleError(weekCheck.error!);
        }
      }

      const updated = await prisma.deliveryScheduleVehicle.update({
        where: { id: tripId },
        data: { status: newStatus },
      });

      revalidatePath(`/sales/delivery-schedules/${trip.scheduleId}`);
      return updated;
    });
  }
);

/**
 * Backward-compat alias: assignVehicleToSchedule now creates a trip.
 * Kept for existing callers; new code should use createScheduleTrip.
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

      // Backward compat: no departureDate required, create with null
      const existing = await prisma.deliveryScheduleVehicle.findFirst({
        where: { scheduleId, vehicleId, departureDate: null },
      });
      if (existing) {
        throw new BusinessRuleError(`Kendaraan "${vehicle.plateNumber}" sudah ditugaskan ke jadwal ini.`);
      }

      const maxSeq = await prisma.deliveryScheduleVehicle.aggregate({
        where: { scheduleId },
        _max: { sequence: true },
      });

      const assigned = await prisma.deliveryScheduleVehicle.create({
        data: {
          scheduleId,
          vehicleId,
          sequence: (maxSeq._max.sequence ?? -1) + 1,
          status: 'PLANNED',
        },
      });

      revalidatePath(`/sales/delivery-schedules/${scheduleId}`);
      return assigned;
    });
  }
);

/**
 * Remove a trip (with guard checks).
 */
export const removeVehicleFromSchedule = withTenant(
  async function removeVehicleFromSchedule(scheduleVehicleId: string) {
    return safeAction(async () => {
      await requireAuth();

      const sv = await prisma.deliveryScheduleVehicle.findUnique({
        where: { id: scheduleVehicleId },
        include: { orders: true },
      });
      if (!sv) throw new NotFoundError("Trip", scheduleVehicleId);

      // Guard: canRemoveTrip
      const removeCheck = canRemoveTrip(sv.status, sv.orders);
      if (!removeCheck.ok) {
        throw new BusinessRuleError(removeCheck.error!);
      }

      // Delete stops first, then trip
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

// ============================================
// Stop Actions — from Sales Order (new)
// ============================================

/**
 * Assign a Sales Order to a trip as a planned stop.
 * No DO needed — plan-first workflow.
 */
export const assignSalesOrderToTrip = withTenant(
  async function assignSalesOrderToTrip(
    tripId: string,
    rawData: { salesOrderId: string; plannedWeightKg?: number; notes?: string }
  ) {
    return safeAction(async () => {
      await requireAuth();

      // Zod validation
      const parsed = assignSalesOrderToTripSchema.safeParse(rawData);
      if (!parsed.success) {
        throw new BusinessRuleError(parsed.error.issues.map((i) => i.message).join(', '));
      }
      const data = parsed.data;

      const trip = await prisma.deliveryScheduleVehicle.findUnique({
        where: { id: tripId },
        include: { schedule: true },
      });
      if (!trip) throw new NotFoundError("Trip", tripId);

      // R-Trip: only PLANNED/CONFIRMED trips accept new stops
      if (trip.status !== 'PLANNED' && trip.status !== 'CONFIRMED') {
        throw new BusinessRuleError(`Trip dengan status "${trip.status}" tidak bisa menerima stop baru.`);
      }

      // Validate SO exists and is schedulable
      const so = await prisma.salesOrder.findUnique({
        where: { id: data.salesOrderId },
        include: { customer: { select: { id: true, name: true } } },
      });
      if (!so) throw new NotFoundError("Sales Order", data.salesOrderId);
      if (!isSOSchedulable(so.status)) {
        throw new BusinessRuleError(`Sales Order "${so.orderNumber}" dengan status "${so.status}" tidak bisa dijadwalkan.`);
      }

      // Validate stop has source
      const sourceCheck = validateStopHasSource(data.salesOrderId, null);
      if (!sourceCheck.ok) throw new BusinessRuleError(sourceCheck.error!);

      // Default sequence
      const maxSeq = await prisma.deliveryScheduleOrder.aggregate({
        where: { scheduleVehicleId: tripId },
        _max: { sequence: true },
      });

      const stop = await prisma.deliveryScheduleOrder.create({
        data: {
          scheduleVehicleId: tripId,
          salesOrderId: data.salesOrderId,
          plannedWeightKg: data.plannedWeightKg ?? null,
          notes: data.notes ?? null,
          sequence: (maxSeq._max.sequence ?? -1) + 1,
          status: 'PLANNED',
        },
      });

      revalidatePath(`/sales/delivery-schedules/${trip.scheduleId}`);
      return stop;
    });
  }
);

/**
 * List schedulable Sales Orders for the SO picker dialog.
 * Returns SO with remaining qty signal + already-planned-this-week flag.
 */
export const listSchedulableSalesOrders = withTenant(
  async function listSchedulableSalesOrders(filters?: {
    weekEnd?: Date;
    customerId?: string;
    search?: string;
    scheduleId?: string;
  }) {
    return safeAction(async () => {
      const where: Prisma.SalesOrderWhereInput = {
        status: { notIn: ['DRAFT', 'CANCELLED'] },
      };

      if (filters?.customerId) {
        where.customerId = filters.customerId;
      }
      if (filters?.search) {
        where.OR = [
          { orderNumber: { contains: filters.search, mode: 'insensitive' } },
          { customer: { name: { contains: filters.search, mode: 'insensitive' } } },
        ];
      }

      const orders = await prisma.salesOrder.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          items: {
            select: {
              id: true,
              quantity: true,
              deliveredQty: true,
              enteredQuantity: true,
              enteredUnit: true,
              productVariant: {
                select: {
                  id: true,
                  name: true,
                  skuCode: true,
                  primaryUnit: true,
                },
              },
            },
          },
          scheduleStops: {
            where: { status: { not: 'CANCELLED' } },
            select: {
              id: true,
              scheduleVehicle: { select: { scheduleId: true } },
            },
          },
        },
        orderBy: { orderDate: 'desc' },
        take: 50,
      });

      // Compute remaining qty signal + filter out fully delivered
      return orders
        .map((so) => {
          const totalOrdered = so.items.reduce((sum, item) => sum + Number(item.quantity), 0);
          const totalDelivered = so.items.reduce((sum, item) => sum + Number(item.deliveredQty), 0);
          const remainingQty = totalOrdered - totalDelivered;

          // Filter to current schedule if scheduleId provided
          const relevantStops = filters?.scheduleId
            ? so.scheduleStops.filter((s) => s.scheduleVehicle.scheduleId === filters.scheduleId)
            : so.scheduleStops;
          const alreadyPlanned = relevantStops.length > 0;
          const multiStop = so.scheduleStops.length > 1;

          return {
            id: so.id,
            orderNumber: so.orderNumber,
            status: so.status,
            orderDate: so.orderDate.toISOString(),
            expectedDate: so.expectedDate?.toISOString() ?? null,
            customer: so.customer,
            totalOrdered,
            totalDelivered,
            remainingQty,
            alreadyPlanned,
            multiStop,
            plannedCount: relevantStops.length,
            items: so.items.map((item) => ({
              id: item.id,
              quantity: Number(item.quantity),
              deliveredQty: Number(item.deliveredQty),
              enteredQuantity: item.enteredQuantity ? Number(item.enteredQuantity) : null,
              enteredUnit: item.enteredUnit,
              productVariant: item.productVariant,
            })),
          };
        })
    });
  }
);

// ============================================
// Stop Actions — from Delivery Order (existing, updated)
// ============================================

/**
 * Assign a delivery order to a trip (existing flow, enhanced with salesOrderId backfill).
 */
export const assignOrderToSchedule = withTenant(
  async function assignOrderToSchedule(scheduleVehicleId: string, deliveryOrderId: string) {
    return safeAction(async () => {
      const session = await requireAuth();

      const sv = await prisma.deliveryScheduleVehicle.findUnique({
        where: { id: scheduleVehicleId },
        include: { vehicle: true, schedule: true },
      });
      if (!sv) throw new NotFoundError("Trip", scheduleVehicleId);

      // R-Trip: only PLANNED/CONFIRMED trips accept new stops
      if (sv.status !== 'PLANNED' && sv.status !== 'CONFIRMED') {
        throw new BusinessRuleError(`Trip dengan status "${sv.status}" tidak bisa menerima stop baru.`);
      }

      const doRecord = await prisma.deliveryOrder.findUnique({
        where: { id: deliveryOrderId },
        include: { salesOrder: true },
      });
      if (!doRecord) throw new NotFoundError("Surat Jalan", deliveryOrderId);

      // R-S3: DO not already assigned to active stop
      const allStops = await prisma.deliveryScheduleOrder.findMany({
        where: { deliveryOrderId, status: { not: 'CANCELLED' } },
        select: { id: true, deliveryOrderId: true, status: true },
      });
      if (isDOAlreadyAssigned(deliveryOrderId, allStops)) {
        throw new BusinessRuleError(`Surat Jalan "${doRecord.orderNumber}" sudah dijadwalkan.`);
      }

      // Auto-apply tariff from VehicleTariff (route-aware)
      const now = new Date();
      const routeKey = doRecord.appliedRouteName?.trim() || null;

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

      // Default sequence
      const maxSeq = await prisma.deliveryScheduleOrder.aggregate({
        where: { scheduleVehicleId },
        _max: { sequence: true },
      });

      const assigned = await prisma.deliveryScheduleOrder.create({
        data: {
          scheduleVehicleId,
          deliveryOrderId,
          salesOrderId: doRecord.salesOrderId, // backfill from DO
          plannedWeightKg: doRecord.estimatedWeightKg ? Number(doRecord.estimatedWeightKg) : null,
          sequence: (maxSeq._max.sequence ?? -1) + 1,
          status: 'LINKED',
        },
      });

      // Update DO with vehicle + tariff snapshot
      if (tariff) {
        const weight = doRecord.estimatedWeightKg ? Number(doRecord.estimatedWeightKg) : null;
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

      // Sync SO shipping cost from DO charges
      try {
        const { syncSalesOrderShippingFromDeliveries } = await import('@/services/sales/delivery-shipping-sync');
        await syncSalesOrderShippingFromDeliveries(doRecord.salesOrderId, {
          userId: session.user.id,
        });
      } catch (err) {
        console.warn('[delivery-shipping-sync] sync failed (non-blocking):', err);
      }

      revalidatePath(`/sales/delivery-schedules/${sv.scheduleId}`);
      return assigned;
    });
  }
);

/**
 * Link an existing DO to a planned stop.
 */
export const linkDeliveryOrderToStop = withTenant(
  async function linkDeliveryOrderToStop(stopId: string, deliveryOrderId: string) {
    return safeAction(async () => {
      const session = await requireAuth();

      const stop = await prisma.deliveryScheduleOrder.findUnique({
        where: { id: stopId },
        include: { scheduleVehicle: { include: { schedule: true, vehicle: true } } },
      });
      if (!stop) throw new NotFoundError("Stop", stopId);
      if (stop.status === 'CANCELLED') {
        throw new BusinessRuleError('Stop sudah dibatalkan.');
      }

      // R-Trip: only PLANNED/CONFIRMED trips accept link changes
      if (stop.scheduleVehicle.status !== 'PLANNED' && stop.scheduleVehicle.status !== 'CONFIRMED') {
        throw new BusinessRuleError(`Trip dengan status "${stop.scheduleVehicle.status}" tidak bisa diubah.`);
      }

      const doRecord = await prisma.deliveryOrder.findUnique({
        where: { id: deliveryOrderId },
        include: { salesOrder: true },
      });
      if (!doRecord) throw new NotFoundError("Surat Jalan", deliveryOrderId);

      // R-S: If stop already has salesOrderId, validate DO belongs to same SO
      if (stop.salesOrderId && doRecord.salesOrderId !== stop.salesOrderId) {
        throw new BusinessRuleError(
          `Surat Jalan "${doRecord.orderNumber}" berasal dari Sales Order yang berbeda dengan stop ini.`
        );
      }

      // R-S3: DO not already assigned
      const allStops = await prisma.deliveryScheduleOrder.findMany({
        where: { deliveryOrderId, status: { not: 'CANCELLED' } },
        select: { id: true, deliveryOrderId: true, status: true },
      });
      if (isDOAlreadyAssigned(deliveryOrderId, allStops.filter((s) => s.id !== stopId))) {
        throw new BusinessRuleError(`Surat Jalan "${doRecord.orderNumber}" sudah dijadwalkan.`);
      }

      const updated = await prisma.deliveryScheduleOrder.update({
        where: { id: stopId },
        data: {
          deliveryOrderId,
          salesOrderId: stop.salesOrderId ?? doRecord.salesOrderId, // fill if missing
          status: 'LINKED',
        },
      });

      // Apply tariff + sync (same as assignOrderToSchedule)
      const sv = stop.scheduleVehicle;
      const now = new Date();
      const routeKey = doRecord.appliedRouteName?.trim() || null;

      const candidates = await prisma.vehicleTariff.findMany({
        where: {
          vehicleId: sv.vehicleId,
          validFrom: { lte: now },
          OR: [{ validUntil: null }, { validUntil: { gte: now } }],
        },
        orderBy: { validFrom: 'desc' },
      });

      let tariff = null;
      if (routeKey) {
        tariff = candidates.find((t) => t.routeName?.trim().toLowerCase() === routeKey.toLowerCase());
      }
      if (!tariff) tariff = candidates.find((t) => !t.routeName || t.routeName.trim() === '');
      if (!tariff) tariff = candidates[0] ?? null;

      if (tariff) {
        const weight = doRecord.estimatedWeightKg ? Number(doRecord.estimatedWeightKg) : null;
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

      try {
        const { syncSalesOrderShippingFromDeliveries } = await import('@/services/sales/delivery-shipping-sync');
        await syncSalesOrderShippingFromDeliveries(doRecord.salesOrderId, { userId: session.user.id });
      } catch (err) {
        console.warn('[delivery-shipping-sync] sync failed (non-blocking):', err);
      }

      revalidatePath(`/sales/delivery-schedules/${sv.scheduleId}`);
      return updated;
    });
  }
);

/**
 * Remove/cancel a stop.
 * PLANNED stops → delete. LINKED/GENERATED → cancel (keep DO).
 */
export const removeOrderFromSchedule = withTenant(
  async function removeOrderFromSchedule(scheduleOrderId: string) {
    return safeAction(async () => {
      await requireAuth();

      const stop = await prisma.deliveryScheduleOrder.findUnique({
        where: { id: scheduleOrderId },
        include: { scheduleVehicle: true },
      });
      if (!stop) throw new NotFoundError("Stop", scheduleOrderId);

      if (stop.status === 'PLANNED' || stop.status === 'CANCELLED') {
        // Hard delete for planned/cancelled stops
        await prisma.deliveryScheduleOrder.delete({ where: { id: scheduleOrderId } });
      } else {
        // Cancel for LINKED/GENERATED (keep DO intact)
        await prisma.deliveryScheduleOrder.update({
          where: { id: scheduleOrderId },
          data: { status: 'CANCELLED' },
        });
      }

      const sv = stop.scheduleVehicle;
      if (sv) {
        revalidatePath(`/sales/delivery-schedules/${sv.scheduleId}`);
      }
      return { success: true };
    });
  }
);

// ============================================
// Generate / Link Surat Jalan (Phase 3)
// ============================================

/**
 * Generate a Delivery Order from a planned stop.
 * Reuses createDeliveryOrderFromSalesOrder from delivery-fulfillment-service
 * which handles: SO status guard, residual qty, SERVICE skip, open DO check.
 * R-D2/D3/D4.
 */
export const generateDeliveryOrderFromStop = withTenant(
  async function generateDeliveryOrderFromStop(
    stopId: string,
    options?: { sourceLocationId?: string }
  ) {
    return safeAction(async () => {
      const session = await requireAuth();

      // Load stop with full context
      const stop = await prisma.deliveryScheduleOrder.findUnique({
        where: { id: stopId },
        include: {
          salesOrder: true,
          deliveryOrder: true,
          scheduleVehicle: { include: { vehicle: true, schedule: true } },
        },
      });
      if (!stop) throw new NotFoundError("Stop", stopId);
      if (stop.status === 'CANCELLED') {
        throw new BusinessRuleError('Stop sudah dibatalkan.');
      }
      if (stop.deliveryOrderId) {
        throw new BusinessRuleError('Stop sudah memiliki Surat Jalan.');
      }
      if (!stop.salesOrderId) {
        throw new BusinessRuleError('Stop tidak memiliki Sales Order.');
      }

      const trip = stop.scheduleVehicle;

      // sourceLocationId: from options → SO → throw
      const so = await prisma.salesOrder.findUnique({
        where: { id: stop.salesOrderId },
        include: { customer: true },
      });
      const sourceLocationId = options?.sourceLocationId || so?.sourceLocationId;
      if (!sourceLocationId) {
        throw new BusinessRuleError('Lokasi sumber (sourceLocationId) tidak ditemukan.');
      }

      // Reuse the validated service function
      const { createDeliveryOrderFromSalesOrder } = await import('@/services/sales/delivery-fulfillment-service');
      const deliveryOrder = await createDeliveryOrderFromSalesOrder({
        salesOrderId: stop.salesOrderId,
        sourceLocationId,
        userId: session.user.id,
        vehicleId: trip.vehicleId,
        appliedRouteName: trip.routeName || undefined,
        estimatedWeightKg: stop.plannedWeightKg ? Number(stop.plannedWeightKg) : undefined,
        destinationAddress: so?.customer?.shippingAddress || so?.customer?.billingAddress || undefined,
      });

      // Apply tariff snapshot (same logic as assignOrderToSchedule)
      const now = new Date();
      const routeKey = trip.routeName?.trim() || null;

      const candidates = await prisma.vehicleTariff.findMany({
        where: {
          vehicleId: trip.vehicleId,
          validFrom: { lte: now },
          OR: [{ validUntil: null }, { validUntil: { gte: now } }],
        },
        orderBy: { validFrom: 'desc' },
      });

      let tariff = null;
      if (routeKey) {
        tariff = candidates.find((t) => t.routeName?.trim().toLowerCase() === routeKey.toLowerCase());
      }
      if (!tariff) tariff = candidates.find((t) => !t.routeName || t.routeName.trim() === '');
      if (!tariff) tariff = candidates[0] ?? null;

      if (tariff) {
        const weight = stop.plannedWeightKg ? Number(stop.plannedWeightKg) : null;
        const { totalCost, totalCharge } = computeDeliveryTotals({
          rateType: tariff.rateType as 'PER_KG' | 'FLAT_RATE',
          costRate: Number(tariff.costRate),
          chargeRate: Number(tariff.chargeRate),
          weightKg: weight,
          minKg: tariff.minKg != null ? Number(tariff.minKg) : null,
        });

        await prisma.deliveryOrder.update({
          where: { id: deliveryOrder.id },
          data: {
            appliedRateType: tariff.rateType as RateType,
            appliedCostRate: tariff.costRate,
            appliedChargeRate: tariff.chargeRate,
            appliedRouteName: tariff.routeName ?? trip.routeName ?? null,
            totalCost,
            totalCharge,
          },
        });
      }

      // Update stop: link DO + status = GENERATED
      await prisma.deliveryScheduleOrder.update({
        where: { id: stopId },
        data: { deliveryOrderId: deliveryOrder.id, status: 'GENERATED' },
      });

      // Sync SO shipping cost from DO charges
      try {
        const { syncSalesOrderShippingFromDeliveries } = await import('@/services/sales/delivery-shipping-sync');
        await syncSalesOrderShippingFromDeliveries(stop.salesOrderId, { userId: session.user.id });
      } catch (err) {
        console.warn('[delivery-shipping-sync] sync failed (non-blocking):', err);
      }

      revalidatePath(`/sales/delivery-schedules/${trip.scheduleId}`);
      return deliveryOrder;
    });
  }
);

/**
 * Generate Delivery Orders for all eligible stops in a trip.
 * R-D5: Atomic per-stop best-effort with partial failure report.
 * Reuses createDeliveryOrderFromSalesOrder for each stop.
 */
export const generateDeliveryOrdersForTrip = withTenant(
  async function generateDeliveryOrdersForTrip(
    tripId: string,
    options?: { sourceLocationId?: string }
  ) {
    return safeAction(async () => {
      const session = await requireAuth();

      const trip = await prisma.deliveryScheduleVehicle.findUnique({
        where: { id: tripId },
        include: { schedule: true },
      });
      if (!trip) throw new NotFoundError("Trip", tripId);

      // Get all stops that need DO generation
      const stops = await prisma.deliveryScheduleOrder.findMany({
        where: {
          scheduleVehicleId: tripId,
          status: 'PLANNED',
          salesOrderId: { not: null },
        },
        orderBy: { sequence: 'asc' },
      });

      if (stops.length === 0) {
        throw new BusinessRuleError('Tidak ada stop yang perlu Surat Jalan dibuat.');
      }

      const { createDeliveryOrderFromSalesOrder } = await import('@/services/sales/delivery-fulfillment-service');

      const results: { ok: string[]; failed: { stopId: string; error: string }[] } = {
        ok: [],
        failed: [],
      };

      for (const stop of stops) {
        try {
          const fullStop = await prisma.deliveryScheduleOrder.findUnique({
            where: { id: stop.id },
            include: {
              salesOrder: true,
              deliveryOrder: true,
              scheduleVehicle: { include: { vehicle: true, schedule: true } },
            },
          });

          if (!fullStop || !fullStop.salesOrderId || fullStop.deliveryOrderId) {
            results.failed.push({ stopId: stop.id, error: 'Stop tidak eligible.' });
            continue;
          }

          const sv = fullStop.scheduleVehicle;
          const so = await prisma.salesOrder.findUnique({
            where: { id: fullStop.salesOrderId },
            include: { customer: true },
          });
          const sourceLocationId = options?.sourceLocationId || so?.sourceLocationId;

          if (!sourceLocationId) {
            results.failed.push({ stopId: stop.id, error: 'Lokasi sumber tidak ditemukan.' });
            continue;
          }

          const deliveryOrder = await createDeliveryOrderFromSalesOrder({
            salesOrderId: fullStop.salesOrderId,
            sourceLocationId,
            userId: session.user.id,
            vehicleId: sv.vehicleId,
            appliedRouteName: sv.routeName || undefined,
            estimatedWeightKg: fullStop.plannedWeightKg ? Number(fullStop.plannedWeightKg) : undefined,
            destinationAddress: so?.customer?.shippingAddress || so?.customer?.billingAddress || undefined,
          });

          // Tariff snapshot
          const now = new Date();
          const routeKey = sv.routeName?.trim() || null;
          const candidates = await prisma.vehicleTariff.findMany({
            where: {
              vehicleId: sv.vehicleId,
              validFrom: { lte: now },
              OR: [{ validUntil: null }, { validUntil: { gte: now } }],
            },
            orderBy: { validFrom: 'desc' },
          });

          let tariff = null;
          if (routeKey) {
            tariff = candidates.find((t) => t.routeName?.trim().toLowerCase() === routeKey.toLowerCase());
          }
          if (!tariff) tariff = candidates.find((t) => !t.routeName || t.routeName.trim() === '');
          if (!tariff) tariff = candidates[0] ?? null;

          if (tariff) {
            const weight = fullStop.plannedWeightKg ? Number(fullStop.plannedWeightKg) : null;
            const { totalCost, totalCharge } = computeDeliveryTotals({
              rateType: tariff.rateType as 'PER_KG' | 'FLAT_RATE',
              costRate: Number(tariff.costRate),
              chargeRate: Number(tariff.chargeRate),
              weightKg: weight,
              minKg: tariff.minKg != null ? Number(tariff.minKg) : null,
            });

            await prisma.deliveryOrder.update({
              where: { id: deliveryOrder.id },
              data: {
                appliedRateType: tariff.rateType as RateType,
                appliedCostRate: tariff.costRate,
                appliedChargeRate: tariff.chargeRate,
                appliedRouteName: tariff.routeName ?? sv.routeName ?? null,
                totalCost,
                totalCharge,
              },
            });
          }

          // Update stop
          await prisma.deliveryScheduleOrder.update({
            where: { id: stop.id },
            data: { deliveryOrderId: deliveryOrder.id, status: 'GENERATED' },
          });

          // Sync SO shipping
          try {
            const { syncSalesOrderShippingFromDeliveries } = await import('@/services/sales/delivery-shipping-sync');
            await syncSalesOrderShippingFromDeliveries(fullStop.salesOrderId, { userId: session.user.id });
          } catch (err) {
            console.warn('[delivery-shipping-sync] sync failed (non-blocking):', err);
          }

          results.ok.push(stop.id);
        } catch (err) {
          results.failed.push({
            stopId: stop.id,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      revalidatePath(`/sales/delivery-schedules/${trip.scheduleId}`);
      return results;
    });
  }
);
