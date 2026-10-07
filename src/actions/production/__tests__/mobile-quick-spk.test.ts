import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    guard: vi.fn(),
    create: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/mobile/mobile-portal-access', () => ({
    requireMobilePortalAccess: mocks.guard,
}));
vi.mock('@/actions/production/production-orders', () => ({
    quickCreateProductionOrder: mocks.create,
}));

import { quickCreateMobileProductionOrder } from '../mobile-quick-spk';

const input = {
    bomId: 'bom-1',
    plannedQuantity: 10,
    machineId: 'machine-1',
    clientRequestId: 'synthetic-request',
};

describe('mobile quick SPK action guard', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.guard.mockResolvedValue({});
        mocks.create.mockResolvedValue({ success: true, data: { id: 'spk-1' } });
    });

    it('checks portal access before delegating to the domain action', async () => {
        await quickCreateMobileProductionOrder(input);
        expect(mocks.guard).toHaveBeenCalledWith('production-supervisor');
        expect(mocks.create).toHaveBeenCalledWith(input);
    });

    it('does not create an SPK when portal access is denied', async () => {
        mocks.guard.mockRejectedValue(new Error('Denied'));
        const result = await quickCreateMobileProductionOrder(input);
        expect(result).toMatchObject({ success: false });
        expect(mocks.create).not.toHaveBeenCalled();
    });
});
