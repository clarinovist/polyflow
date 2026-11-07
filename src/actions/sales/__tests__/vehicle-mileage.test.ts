import { beforeEach, describe, expect, it, vi } from 'vitest';
import { correctVehicleMileage, finishVehicleMileage, getFleetMileageBoard, startVehicleMileage } from '../vehicle-mileage';
import { BusinessRuleError } from '@/lib/errors/errors';

const mocks = vi.hoisted(() => ({ sales: vi.fn(), revalidate: vi.fn(), board: vi.fn(), start: vi.fn(), finish: vi.fn(), correct: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/auth/sales-access', () => ({ requireSalesAccess: mocks.sales }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/services/sales/vehicle-mileage-service', () => ({
    listFleetMileageBoard: mocks.board, startVehicleMileage: mocks.start, finishVehicleMileage: mocks.finish, correctVehicleMileage: mocks.correct,
}));

const mutations = [startVehicleMileage, finishVehicleMileage, correctVehicleMileage];
beforeEach(() => {
    vi.resetAllMocks();
    mocks.sales.mockResolvedValue({ user: { id: 'u' } });
    for (const fn of [mocks.start, mocks.finish, mocks.correct]) fn.mockResolvedValue({ mileageId: 'm', vehicleId: 'v' });
});
describe('vehicle mileage actions', () => {
    it.each(mutations)('rejects unauthorized callers before touching the service or cache', async (action) => {
        mocks.sales.mockRejectedValue(new BusinessRuleError('Unauthorized'));
        expect(await action({})).toMatchObject({ success: false, error: 'Unauthorized' });
        for (const fn of [mocks.start, mocks.finish, mocks.correct]) expect(fn).not.toHaveBeenCalled();
        expect(mocks.revalidate).not.toHaveBeenCalled();
    });
    it('guards the board read with sales access', async () => {
        mocks.board.mockResolvedValue([{ vehicleId: 'v' }]);
        expect(await getFleetMileageBoard()).toEqual({ success: true, data: [{ vehicleId: 'v' }] });
        mocks.sales.mockRejectedValue(new BusinessRuleError('Unauthorized'));
        expect(await getFleetMileageBoard()).toMatchObject({ success: false });
        expect(mocks.board).toHaveBeenCalledTimes(1);
    });
    it.each([
        [startVehicleMileage, () => mocks.start],
        [finishVehicleMileage, () => mocks.finish],
        [correctVehicleMileage, () => mocks.correct],
    ])('passes the session user and revalidates list, entry page and vehicle detail', async (action, service) => {
        const input = { any: 'payload' };
        expect(await action(input)).toMatchObject({ success: true, data: { mileageId: 'm' } });
        expect(service()).toHaveBeenCalledWith(input, 'u');
        expect(mocks.revalidate).toHaveBeenCalledWith('/sales/vehicles');
        expect(mocks.revalidate).toHaveBeenCalledWith('/sales/vehicles/km');
        expect(mocks.revalidate).toHaveBeenCalledWith('/sales/vehicles/v');
    });
    it('returns the service rule violation without revalidating', async () => {
        mocks.correct.mockRejectedValue(new BusinessRuleError('Alasan koreksi minimal 5 karakter'));
        expect(await correctVehicleMileage({})).toMatchObject({ success: false, error: 'Alasan koreksi minimal 5 karakter' });
        expect(mocks.revalidate).not.toHaveBeenCalled();
    });
});
