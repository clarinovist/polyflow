'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import {
    requireSalesAccess,
    requireSalesApprover,
} from '@/lib/auth/sales-access';
import {
    safeAction,
    BusinessRuleError,
    NotFoundError,
} from '@/lib/errors/errors';
import {
    createVehicleTariffSchema,
    CreateVehicleTariffValues,
} from '@/lib/schemas/sales';
import { routesMatch, customersMatch } from '@/lib/sales/delivery-pricing';
import { findApplicableVehicleTariff } from '@/lib/sales/vehicle-tariff-resolver';
import { Prisma, RateType } from '@prisma/client';
import { revalidatePath } from 'next/cache';

/**
 * Get all tariffs for a vehicle.
 */
export const getTariffsByVehicle = withTenant(
    async function getTariffsByVehicle(vehicleId: string) {
        return safeAction(async () => {
            await requireSalesAccess();

            return prisma.vehicleTariff.findMany({
                where: { vehicleId },
                orderBy: { validFrom: 'desc' },
            });
        });
    },
);

/**
 * Get the currently valid tariff for a vehicle, optionally filtered by route
 * and customer. Delegates to findApplicableVehicleTariff for precedence logic.
 */
export const getActiveTariff = withTenant(async function getActiveTariff(
    vehicleId: string,
    routeName?: string | null,
    customerId?: string | null,
) {
    return safeAction(async () => {
        await requireSalesAccess();

        return findApplicableVehicleTariff({
            vehicleId,
            routeName,
            customerId,
        });
    });
});

/**
 * List distinct route names for a vehicle's tariffs (non-null only).
 * Used to populate route selector in UI.
 */
export const listVehicleRouteOptions = withTenant(
    async function listVehicleRouteOptions(vehicleId: string) {
        return safeAction(async () => {
            await requireSalesAccess();

            const tariffs = await prisma.vehicleTariff.findMany({
                where: { vehicleId, routeName: { not: null } },
                select: { routeName: true },
                distinct: ['routeName'],
                orderBy: { routeName: 'asc' },
            });
            return tariffs
                .map((t) => t.routeName)
                .filter((r): r is string => r != null && r.trim().length > 0);
        });
    },
);

/**
 * Create a new vehicle tariff.
 */
export const createVehicleTariff = withTenant(
    async function createVehicleTariff(data: CreateVehicleTariffValues) {
        return safeAction(async () => {
            await requireSalesAccess();

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
                throw new NotFoundError('Kendaraan', result.data.vehicleId);
            }

            // Validate validUntil > validFrom
            if (
                result.data.validUntil &&
                result.data.validUntil <= result.data.validFrom
            ) {
                throw new BusinessRuleError(
                    'Tanggal berlaku sampai harus setelah tanggal berlaku dari.',
                );
            }

            // Check for overlapping tariff on same vehicle AND same route AND same customer scope
            const newValidFrom = result.data.validFrom;
            const newValidUntil = result.data.validUntil;
            const candidates = await prisma.vehicleTariff.findMany({
                where: {
                    vehicleId: result.data.vehicleId,
                    AND: [
                        {
                            validFrom: {
                                lte: newValidUntil || new Date('2099-12-31'),
                            },
                        },
                        {
                            OR: [
                                { validUntil: null },
                                { validUntil: { gte: newValidFrom } },
                            ],
                        },
                    ],
                },
            });
            const overlapping = candidates.find(
                (t) =>
                    routesMatch(t.routeName, result.data.routeName) &&
                    customersMatch(t.customerId, result.data.customerId),
            );
            if (overlapping) {
                const routeLabel = overlapping.routeName || 'Semua Rute';
                throw new BusinessRuleError(
                    `Sudah ada tarif untuk rute "${routeLabel}" pada periode yang tumpang tindih (sejak ${overlapping.validFrom.toLocaleDateString('id-ID')}).`,
                );
            }

            const tariff = await prisma.vehicleTariff.create({
                data: {
                    vehicleId: result.data.vehicleId,
                    customerId: result.data.customerId || null,
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
    },
);

/**
 * Update an existing vehicle tariff.
 */
export const updateVehicleTariff = withTenant(
    async function updateVehicleTariff(
        id: string,
        data: CreateVehicleTariffValues,
    ) {
        return safeAction(async () => {
            await requireSalesAccess();

            const existing = await prisma.vehicleTariff.findUnique({
                where: { id },
            });
            if (!existing) throw new NotFoundError('Tarif', id);

            const result = createVehicleTariffSchema.safeParse(data);
            if (!result.success) {
                throw new BusinessRuleError(result.error.issues[0].message);
            }

            if (
                result.data.validUntil &&
                result.data.validUntil <= result.data.validFrom
            ) {
                throw new BusinessRuleError(
                    'Tanggal berlaku sampai harus setelah tanggal berlaku dari.',
                );
            }

            // Check for overlapping tariff on same vehicle AND same route AND same customer scope (exclude self)
            const newValidFrom = result.data.validFrom;
            const newValidUntil = result.data.validUntil;
            const candidates = await prisma.vehicleTariff.findMany({
                where: {
                    vehicleId: result.data.vehicleId,
                    id: { not: id },
                    AND: [
                        {
                            validFrom: {
                                lte: newValidUntil || new Date('2099-12-31'),
                            },
                        },
                        {
                            OR: [
                                { validUntil: null },
                                { validUntil: { gte: newValidFrom } },
                            ],
                        },
                    ],
                },
            });
            const overlapping = candidates.find(
                (t) =>
                    routesMatch(t.routeName, result.data.routeName) &&
                    customersMatch(t.customerId, result.data.customerId),
            );
            if (overlapping) {
                const routeLabel = overlapping.routeName || 'Semua Rute';
                throw new BusinessRuleError(
                    `Sudah ada tarif untuk rute "${routeLabel}" pada periode yang tumpang tindih (sejak ${overlapping.validFrom.toLocaleDateString('id-ID')}).`,
                );
            }

            const tariff = await prisma.vehicleTariff.update({
                where: { id },
                data: {
                    vehicleId: result.data.vehicleId,
                    customerId: result.data.customerId || null,
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
    },
);

/**
 * List all vehicle tariffs across all vehicles, with optional filters.
 * Joins vehicle (plateNumber, name) and customer (name).
 * Ordered by validFrom desc. Capped at 200 rows as safety guard.
 */
export const getAllVehicleTariffs = withTenant(
    async function getAllVehicleTariffs(
        filters?: {
            customerId?: string;
            vehicleId?: string;
            routeName?: string;
        },
    ) {
        return safeAction(async () => {
            await requireSalesAccess();

            const where: Prisma.VehicleTariffWhereInput = {};
            if (filters?.customerId) where.customerId = filters.customerId;
            if (filters?.vehicleId) where.vehicleId = filters.vehicleId;
            if (filters?.routeName) where.routeName = filters.routeName;

            return prisma.vehicleTariff.findMany({
                where,
                include: {
                    vehicle: { select: { plateNumber: true, name: true } },
                    customer: { select: { id: true, name: true } },
                },
                orderBy: { validFrom: 'desc' },
                take: 200,
            });
        });
    },
);

/**
 * Delete a vehicle tariff.
 */
export const deleteVehicleTariff = withTenant(
    async function deleteVehicleTariff(id: string) {
        return safeAction(async () => {
            await requireSalesApprover();

            const existing = await prisma.vehicleTariff.findUnique({
                where: { id },
            });
            if (!existing) throw new NotFoundError('Tarif', id);

            await prisma.vehicleTariff.delete({ where: { id } });

            revalidatePath(`/sales/vehicles/${existing.vehicleId}`);
            return { success: true };
        });
    },
);
