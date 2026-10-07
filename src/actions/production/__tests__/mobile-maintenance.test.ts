import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    guard: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/mobile/mobile-portal-access', () => ({
    requireMobilePortalAccess: mocks.guard,
}));
vi.mock('@/actions/production/maintenance', () => ({
    approveMaintenanceRequest: mocks.approve,
    rejectMaintenanceRequest: mocks.reject,
}));

import {
    approveMobileMaintenanceRequest,
    rejectMobileMaintenanceRequest,
} from '../mobile-maintenance';

describe('mobile maintenance capability guard', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.guard.mockResolvedValue({});
        mocks.approve.mockResolvedValue({ success: true, data: null });
        mocks.reject.mockResolvedValue({ success: true, data: null });
    });

    it('requires the explicit feature before approving', async () => {
        await approveMobileMaintenanceRequest('request-1', 'technician-1');
        expect(mocks.guard).toHaveBeenCalledWith(
            'production-supervisor',
            'feature:mobile-maintenance-approval',
        );
    });

    it('requires the explicit feature before rejecting', async () => {
        await rejectMobileMaintenanceRequest('request-1', 'reason');
        expect(mocks.guard).toHaveBeenCalledWith(
            'production-supervisor',
            'feature:mobile-maintenance-approval',
        );
    });

    it('does not call the domain action when capability is disabled', async () => {
        mocks.guard.mockRejectedValue(new Error('Denied'));
        const result = await approveMobileMaintenanceRequest(
            'request-1',
            'technician-1',
        );
        expect(result).toMatchObject({ success: false });
        expect(mocks.approve).not.toHaveBeenCalled();
    });
});
