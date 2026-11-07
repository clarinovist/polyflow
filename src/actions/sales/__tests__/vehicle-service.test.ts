import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    correctVehicleService, createServiceItem, getFleetServiceAlerts, getVehicleServiceStatus, recordVehicleService, updateServiceItem,
} from '../vehicle-service';
import { BusinessRuleError } from '@/lib/errors/errors';

const mocks = vi.hoisted(() => ({
    sales: vi.fn(), revalidate: vi.fn(), status: vi.fn(), alerts: vi.fn(), create: vi.fn(), update: vi.fn(), record: vi.fn(), correct: vi.fn(),
}));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/auth/sales-access', () => ({ requireSalesAccess: mocks.sales }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/services/sales/vehicle-service-service', () => ({
    listVehicleServiceStatus: mocks.status, listFleetServiceAlerts: mocks.alerts, createServiceItem: mocks.create,
    updateServiceItem: mocks.update, recordVehicleService: mocks.record, correctVehicleService: mocks.correct,
}));

const mutations = [
    [createServiceItem, () => mocks.create],
    [updateServiceItem, () => mocks.update],
    [recordVehicleService, () => mocks.record],
    [correctVehicleService, () => mocks.correct],
] as const;
beforeEach(() => {
    vi.resetAllMocks();
    mocks.sales.mockResolvedValue({ user: { id: 'u' } });
    for (const fn of [mocks.create, mocks.update, mocks.record, mocks.correct]) fn.mockResolvedValue({ itemId: 'i', vehicleId: 'v' });
});
describe('vehicle service actions', () => {
    it.each(mutations)('rejects unauthorized callers before touching the service or cache', async (action) => {
        mocks.sales.mockRejectedValue(new BusinessRuleError('Unauthorized'));
        expect(await action({})).toMatchObject({ success: false, error: 'Unauthorized' });
        for (const fn of [mocks.create, mocks.update, mocks.record, mocks.correct]) expect(fn).not.toHaveBeenCalled();
        expect(mocks.revalidate).not.toHaveBeenCalled();
    });
    it.each(mutations)('passes the session user and revalidates list, entry page and vehicle detail', async (action, service) => {
        const input = { any: 'payload' };
        expect(await action(input)).toMatchObject({ success: true, data: { vehicleId: 'v' } });
        expect(service()).toHaveBeenCalledWith(input, 'u');
        expect(mocks.revalidate).toHaveBeenCalledWith('/sales/vehicles');
        expect(mocks.revalidate).toHaveBeenCalledWith('/sales/vehicles/km');
        expect(mocks.revalidate).toHaveBeenCalledWith('/sales/vehicles/v');
    });
    it('returns a service rule violation without revalidating', async () => {
        mocks.correct.mockRejectedValue(new BusinessRuleError('Alasan koreksi minimal 5 karakter'));
        expect(await correctVehicleService({})).toMatchObject({ success: false, error: 'Alasan koreksi minimal 5 karakter' });
        expect(mocks.revalidate).not.toHaveBeenCalled();
    });
    it('guards the status read with sales access and passes the vehicle id', async () => {
        mocks.status.mockResolvedValue({ vehicleId: 'v', items: [] });
        expect(await getVehicleServiceStatus('v')).toEqual({ success: true, data: { vehicleId: 'v', items: [] } });
        expect(mocks.status).toHaveBeenCalledWith('v');
        mocks.sales.mockRejectedValue(new BusinessRuleError('Unauthorized'));
        expect(await getVehicleServiceStatus('v')).toMatchObject({ success: false });
        expect(mocks.status).toHaveBeenCalledTimes(1);
    });
    it('guards the fleet alert read with sales access', async () => {
        mocks.alerts.mockResolvedValue([{ vehicleId: 'v' }]);
        expect(await getFleetServiceAlerts()).toEqual({ success: true, data: [{ vehicleId: 'v' }] });
        mocks.sales.mockRejectedValue(new BusinessRuleError('Unauthorized'));
        expect(await getFleetServiceAlerts()).toMatchObject({ success: false });
        expect(mocks.alerts).toHaveBeenCalledTimes(1);
    });
});
