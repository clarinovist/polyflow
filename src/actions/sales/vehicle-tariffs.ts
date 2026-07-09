'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction, BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { createVehicleTariffSchema, CreateVehicleTariffValues } from '@/lib/schemas/sales';
import { RateType } from '@prisma/client';
import { revalidatePath } from 'next/cache';

/**
 * Get all tariffs for a vehicle.
 */
export const getTariffsByVehicle = withTenant(
  async function getTariffsByVehicle(vehicleId: string) {
    return safeAction(async () => {
      return prisma.vehicleTariff.findMany({
        where: { vehicleId },
        orderBy: { validFrom: 'desc' },
      });
    });
  }
);

/**
 * Get the currently valid tariff for a vehicle.
 * Used when assigning DO to a vehicle to auto-fill tariff.
 */
export const getActiveTariff = withTenant(
  async function getActiveTariff(vehicleId: string) {
    return safeAction(async () => {
      const now = new Date();
      const tariff = await prisma.vehicleTariff.findFirst({
        where: {
          vehicleId,
          validFrom: { lte: now },
          OR: [
            { validUntil: null },
            { validUntil: { gte: now } },
          ],
        },
        orderBy: { validFrom: 'desc' },
      });
      return tariff || null;
    });
  }
);

/**
 * Create a new vehicle tariff.
 */
export const createVehicleTariff = withTenant(
  async function createVehicleTariff(data: CreateVehicleTariffValues) {
    return safeAction(async () => {
      await requireAuth();

      const result = createVehicleTariffSchema.safeParse(data);
      if (!result.success) {
        throw new BusinessRuleError(result.error.issues[0].message);
      }

      // Validate vehicle exists
      const vehicle = await prisma.vehicle.findUnique({
        where: { id: result.data.vehicleId },
        select: { id: true, plateNumber: true },
      });
      if (!vehicle) {
        throw new NotFoundError("Kendaraan", result.data.vehicleId);
      }

      // Validate validUntil > validFrom
      if (result.data.validUntil && result.data.validUntil <= result.data.validFrom) {
        throw new BusinessRuleError("Tanggal berlaku sampai harus setelah tanggal berlaku dari.");
      }

      // Check for overlapping tariff on same vehicle
      const newValidFrom = result.data.validFrom;
      const newValidUntil = result.data.validUntil;
      const overlapping = await prisma.vehicleTariff.findFirst({
        where: {
          vehicleId: result.data.vehicleId,
          id: { not: undefined }, // exclude self on update
          AND: [
            { validFrom: { lte: newValidUntil || new Date('2099-12-31') } },
            {
              OR: [
                { validUntil: null }, // open-ended tariff
                { validUntil: { gte: newValidFrom } },
              ],
            },
          ],
        },
      });
      if (overlapping) {
        throw new BusinessRuleError(
          `Sudah ada tarif aktif untuk kendaraan ini pada periode yang berlaku (sejak ${overlapping.validFrom.toLocaleDateString('id-ID')}). Tidak boleh ada tarif yang tumpang tindih.`
        );
      }

      const tariff = await prisma.vehicleTariff.create({
        data: {
          vehicleId: result.data.vehicleId,
          rateType: result.data.rateType as RateType,
          costRate: result.data.costRate,
          chargeRate: result.data.chargeRate,
          routeName: result.data.routeName || null,
          minKg: result.data.minKg ?? null,
          validFrom: result.data.validFrom,
          validUntil: result.data.validUntil || null,
          notes: result.data.notes || null,
        },
      });

      revalidatePath(`/sales/vehicles/${result.data.vehicleId}`);
      return tariff;
    });
  }
);

/**
 * Update an existing vehicle tariff.
 */
export const updateVehicleTariff = withTenant(
  async function updateVehicleTariff(id: string, data: CreateVehicleTariffValues) {
    return safeAction(async () => {
      await requireAuth();

      const existing = await prisma.vehicleTariff.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("Tarif", id);

      const result = createVehicleTariffSchema.safeParse(data);
      if (!result.success) {
        throw new BusinessRuleError(result.error.issues[0].message);
      }

      if (result.data.validUntil && result.data.validUntil <= result.data.validFrom) {
        throw new BusinessRuleError("Tanggal berlaku sampai harus setelah tanggal berlaku dari.");
      }

      // Check for overlapping tariff on same vehicle (exclude self)
      const newValidFrom = result.data.validFrom;
      const newValidUntil = result.data.validUntil;
      const overlapping = await prisma.vehicleTariff.findFirst({
        where: {
          vehicleId: result.data.vehicleId,
          id: { not: id }, // exclude self
          AND: [
            { validFrom: { lte: newValidUntil || new Date('2099-12-31') } },
            {
              OR: [
                { validUntil: null },
                { validUntil: { gte: newValidFrom } },
              ],
            },
          ],
        },
      });
      if (overlapping) {
        throw new BusinessRuleError(
          `Sudah ada tarif aktif untuk kendaraan ini pada periode yang berlaku (sejak ${overlapping.validFrom.toLocaleDateString('id-ID')}). Tidak boleh ada tarif yang tumpang tindih.`
        );
      }

      const tariff = await prisma.vehicleTariff.update({
        where: { id },
        data: {
          vehicleId: result.data.vehicleId,
          rateType: result.data.rateType as RateType,
          costRate: result.data.costRate,
          chargeRate: result.data.chargeRate,
          routeName: result.data.routeName || null,
          minKg: result.data.minKg ?? null,
          validFrom: result.data.validFrom,
          validUntil: result.data.validUntil || null,
          notes: result.data.notes || null,
        },
      });

      revalidatePath(`/sales/vehicles/${result.data.vehicleId}`);
      return tariff;
    });
  }
);

/**
 * Delete a vehicle tariff.
 */
export const deleteVehicleTariff = withTenant(
  async function deleteVehicleTariff(id: string) {
    return safeAction(async () => {
      await requireAuth();

      const existing = await prisma.vehicleTariff.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("Tarif", id);

      await prisma.vehicleTariff.delete({ where: { id } });

      revalidatePath(`/sales/vehicles/${existing.vehicleId}`);
      return { success: true };
    });
  }
);
