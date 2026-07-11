'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction, BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { createVehicleSchema, updateVehicleSchema, CreateVehicleValues } from '@/lib/schemas/sales';
import { VehicleType, OwnershipType, VehicleStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

/**
 * List all vehicles, optionally filtered by ownershipType and status.
 */
export const getVehicles = withTenant(
  async function getVehicles(filters?: { ownershipType?: string; status?: string }) {
    return safeAction(async () => {
      return prisma.vehicle.findMany({
        where: {
          ...(filters?.ownershipType && { ownershipType: filters.ownershipType as OwnershipType }),
          ...(filters?.status && { status: filters.status as VehicleStatus }),
        },
        include: {
          tariffs: {
            orderBy: { validFrom: 'desc' },
            take: 1, // latest tariff only for list view
          },
          _count: {
            select: { deliveryOrders: true },
          },
        },
        orderBy: { plateNumber: 'asc' },
      });
    });
  }
);

/**
 * Get single vehicle with all tariffs.
 */
export const getVehicle = withTenant(
  async function getVehicle(id: string) {
    return safeAction(async () => {
      const vehicle = await prisma.vehicle.findUnique({
        where: { id },
        include: {
          tariffs: { orderBy: { validFrom: 'desc' } },
          _count: { select: { deliveryOrders: true } },
        },
      });
      if (!vehicle) throw new NotFoundError("Kendaraan", id);
      return vehicle;
    });
  }
);

/**
 * Create a new vehicle.
 */
export const createVehicle = withTenant(
  async function createVehicle(data: CreateVehicleValues) {
    return safeAction(async () => {
      await requireAuth();

      const result = createVehicleSchema.safeParse(data);
      if (!result.success) {
        throw new BusinessRuleError(result.error.issues[0].message);
      }

      // Check duplicate plate number
      const existing = await prisma.vehicle.findUnique({
        where: { plateNumber: result.data.plateNumber },
        select: { id: true },
      });
      if (existing) {
        throw new BusinessRuleError(`Nomor polisi "${result.data.plateNumber}" sudah terdaftar. Gunakan nomor lain.`);
      }

      const vehicle = await prisma.vehicle.create({
        data: {
          plateNumber: result.data.plateNumber,
          name: result.data.name,
          vehicleType: result.data.vehicleType as VehicleType,
          ownershipType: result.data.ownershipType as OwnershipType,
          ownerName: result.data.ownerName || null,
          driverName: result.data.driverName || null,
          capacityKg: result.data.capacityKg ?? null,
          status: result.data.status as VehicleStatus,
          notes: result.data.notes || null,
          photoUrl: result.data.photoUrl || null,
          kirNumber: result.data.kirNumber || null,
          kirExpireDate: result.data.kirExpireDate || null,
        },
      });

      revalidatePath('/sales/vehicles');
      return vehicle;
    });
  }
);

/**
 * Update an existing vehicle.
 */
export const updateVehicle = withTenant(
  async function updateVehicle(id: string, data: CreateVehicleValues) {
    return safeAction(async () => {
      await requireAuth();

      const vehicle = await prisma.vehicle.findUnique({ where: { id } });
      if (!vehicle) throw new NotFoundError("Kendaraan", id);

      const result = updateVehicleSchema.safeParse(data);
      if (!result.success) {
        throw new BusinessRuleError(result.error.issues[0].message);
      }

      // Check duplicate plate number (exclude current)
      const duplicate = await prisma.vehicle.findFirst({
        where: {
          plateNumber: result.data.plateNumber,
          id: { not: id },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new BusinessRuleError(`Nomor polisi "${result.data.plateNumber}" sudah digunakan kendaraan lain.`);
      }

      const updated = await prisma.vehicle.update({
        where: { id },
        data: {
          plateNumber: result.data.plateNumber,
          name: result.data.name,
          vehicleType: result.data.vehicleType as VehicleType,
          ownershipType: result.data.ownershipType as OwnershipType,
          ownerName: result.data.ownerName || null,
          driverName: result.data.driverName || null,
          capacityKg: result.data.capacityKg ?? null,
          status: result.data.status as VehicleStatus,
          notes: result.data.notes || null,
          photoUrl: result.data.photoUrl || null,
          kirNumber: result.data.kirNumber || null,
          kirExpireDate: result.data.kirExpireDate || null,
        },
      });

      revalidatePath('/sales/vehicles');
      revalidatePath(`/sales/vehicles/${id}`);
      return updated;
    });
  }
);

/**
 * Soft delete: set status to INACTIVE.
 */
export const deleteVehicle = withTenant(
  async function deleteVehicle(id: string) {
    return safeAction(async () => {
      await requireAuth();

      const vehicle = await prisma.vehicle.findUnique({ where: { id } });
      if (!vehicle) throw new NotFoundError("Kendaraan", id);

      // Check if vehicle has active delivery orders
      const activeDOCount = await prisma.deliveryOrder.count({
        where: {
          vehicleId: id,
          status: { in: ['PENDING', 'LOADING', 'SHIPPED', 'IN_TRANSIT', 'ARRIVED'] },
        },
      });
      if (activeDOCount > 0) {
        throw new BusinessRuleError(
          `Kendaraan "${vehicle.plateNumber}" masih memiliki ${activeDOCount} pengiriman aktif. Selesaikan pengiriman terlebih dahulu.`
        );
      }

      await prisma.vehicle.update({
        where: { id },
        data: { status: 'INACTIVE' },
      });

      revalidatePath('/sales/vehicles');
      return { success: true };
    });
  }
);
