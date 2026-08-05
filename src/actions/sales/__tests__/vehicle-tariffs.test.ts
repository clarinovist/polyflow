import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createVehicleTariff,
    getActiveTariff,
    getAllVehicleTariffs,
} from '../vehicle-tariffs';
import { prisma } from '@/lib/core/prisma';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        vehicle: {
            findUnique: vi.fn(),
        },
        vehicleTariff: {
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/errors/errors', () => ({
    safeAction: vi.fn((fn: unknown) => (fn as () => unknown)()),
    BusinessRuleError: class BusinessRuleError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'BusinessRuleError';
        }
    },
    NotFoundError: class NotFoundError extends Error {
        constructor(entity: string, id: string) {
            super(`${entity} ${id} not found`);
            this.name = 'NotFoundError';
        }
    },
}));

vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesAccess: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
    requireSalesApprover: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

vi.mock('@/lib/schemas/sales', () => ({
    createVehicleTariffSchema: {
        safeParse: (d: unknown) => ({ success: true, data: d }),
    },
}));

vi.mock('@/lib/sales/vehicle-tariff-resolver', () => ({
    findApplicableVehicleTariff: vi.fn(),
}));

describe('vehicle-tariffs actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ============================================
    // createVehicleTariff — overlap check with customerId
    // ============================================
    describe('createVehicleTariff', () => {
        it('allows customer-specific tariff to coexist with general tariff on same route+period', async () => {
            const vehicle = { id: 'v1', plateNumber: 'B 1234 CD' };
            vi.mocked(prisma.vehicle.findUnique).mockResolvedValue(vehicle as never);

            // Existing general tariff (customerId=null) on same route+period
            const existingGeneral = {
                id: 't-general',
                vehicleId: 'v1',
                customerId: null,
                routeName: 'Solo',
                validFrom: new Date('2026-01-01'),
                validUntil: new Date('2026-12-31'),
            };
            vi.mocked(prisma.vehicleTariff.findMany).mockResolvedValue([
                existingGeneral,
            ] as never);

            const newTariff = { id: 't-customer', vehicleId: 'v1' };
            vi.mocked(prisma.vehicleTariff.create).mockResolvedValue(
                newTariff as never,
            );

            // Should NOT throw — customer-specific and general coexist
            const result = await createVehicleTariff({
                vehicleId: 'v1',
                customerId: 'cust-1',
                rateType: 'PER_KG',
                costRate: 500,
                chargeRate: 750,
                routeName: 'Solo',
                validFrom: new Date('2026-01-01'),
            });

            expect(result).toEqual(newTariff);
        });

        it('rejects two tariffs with same customerId + same route + overlapping period', async () => {
            const vehicle = { id: 'v1', plateNumber: 'B 1234 CD' };
            vi.mocked(prisma.vehicle.findUnique).mockResolvedValue(vehicle as never);

            // Existing tariff for same customer + same route
            const existing = {
                id: 't-existing',
                vehicleId: 'v1',
                customerId: 'cust-1',
                routeName: 'Solo',
                validFrom: new Date('2026-01-01'),
                validUntil: new Date('2026-12-31'),
            };
            vi.mocked(prisma.vehicleTariff.findMany).mockResolvedValue([
                existing,
            ] as never);

            await expect(
                createVehicleTariff({
                    vehicleId: 'v1',
                    customerId: 'cust-1',
                    rateType: 'PER_KG',
                    costRate: 600,
                    chargeRate: 800,
                    routeName: 'Solo',
                    validFrom: new Date('2026-06-01'),
                }),
            ).rejects.toThrow('Sudah ada tarif');
        });

        it('allows two general tariffs with null customerId on different routes', async () => {
            const vehicle = { id: 'v1', plateNumber: 'B 1234 CD' };
            vi.mocked(prisma.vehicle.findUnique).mockResolvedValue(vehicle as never);

            const existing = {
                id: 't-existing',
                vehicleId: 'v1',
                customerId: null,
                routeName: 'Solo',
                validFrom: new Date('2026-01-01'),
                validUntil: new Date('2026-12-31'),
            };
            vi.mocked(prisma.vehicleTariff.findMany).mockResolvedValue([
                existing,
            ] as never);

            const newTariff = { id: 't-new', vehicleId: 'v1' };
            vi.mocked(prisma.vehicleTariff.create).mockResolvedValue(
                newTariff as never,
            );

            // Different route — should not conflict
            const result = await createVehicleTariff({
                vehicleId: 'v1',
                rateType: 'FLAT_RATE',
                costRate: 100000,
                chargeRate: 150000,
                routeName: 'Boyolali',
                validFrom: new Date('2026-01-01'),
            });

            expect(result).toEqual(newTariff);
        });
    });

    // ============================================
    // getActiveTariff — customerId passthrough
    // ============================================
    describe('getActiveTariff', () => {
        it('delegates to findApplicableVehicleTariff with customerId', async () => {
            const { findApplicableVehicleTariff } = await import(
                '@/lib/sales/vehicle-tariff-resolver'
            );
            const mockTariff = { id: 't1', customerId: 'cust-1' };
            vi.mocked(findApplicableVehicleTariff).mockResolvedValue(
                mockTariff as never,
            );

            const result = await getActiveTariff(
                'v1',
                'Solo',
                'cust-1',
            );

            expect(findApplicableVehicleTariff).toHaveBeenCalledWith({
                vehicleId: 'v1',
                routeName: 'Solo',
                customerId: 'cust-1',
            });
            expect(result).toEqual(mockTariff);
        });

        it('delegates without customerId (backward compatible)', async () => {
            const { findApplicableVehicleTariff } = await import(
                '@/lib/sales/vehicle-tariff-resolver'
            );
            vi.mocked(findApplicableVehicleTariff).mockResolvedValue(null);

            const result = await getActiveTariff('v1', 'Solo');

            expect(findApplicableVehicleTariff).toHaveBeenCalledWith({
                vehicleId: 'v1',
                routeName: 'Solo',
                customerId: undefined,
            });
            expect(result).toBeNull();
        });
    });

    // ============================================
    // getAllVehicleTariffs — list all tariffs across vehicles
    // ============================================
    describe('getAllVehicleTariffs', () => {
        it('queries all tariffs with vehicle and customer joins', async () => {
            const mockTariffs = [
                {
                    id: 't1',
                    vehicleId: 'v1',
                    customerId: 'c1',
                    vehicle: { plateNumber: 'B 1234', name: 'Truck A' },
                    customer: { id: 'c1', name: 'Customer X' },
                },
            ];
            vi.mocked(prisma.vehicleTariff.findMany).mockResolvedValue(
                mockTariffs as never,
            );

            const result = await getAllVehicleTariffs();

            expect(prisma.vehicleTariff.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    include: expect.objectContaining({
                        vehicle: { select: { plateNumber: true, name: true } },
                        customer: { select: { id: true, name: true } },
                    }),
                    orderBy: { validFrom: 'desc' },
                    take: 200,
                }),
            );
            expect(result).toEqual(mockTariffs);
        });

        it('applies customerId filter when provided', async () => {
            vi.mocked(prisma.vehicleTariff.findMany).mockResolvedValue(
                [] as never,
            );

            await getAllVehicleTariffs({ customerId: 'c1' });

            expect(prisma.vehicleTariff.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { customerId: 'c1' },
                }),
            );
        });

        it('applies vehicleId filter when provided', async () => {
            vi.mocked(prisma.vehicleTariff.findMany).mockResolvedValue(
                [] as never,
            );

            await getAllVehicleTariffs({ vehicleId: 'v1' });

            expect(prisma.vehicleTariff.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { vehicleId: 'v1' },
                }),
            );
        });
    });
});
