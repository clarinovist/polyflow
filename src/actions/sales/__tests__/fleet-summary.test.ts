import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFleetOverview } from '../fleet-summary';
import { BusinessRuleError } from '@/lib/errors/errors';
const mocks = vi.hoisted(() => ({ guard: vi.fn(), summaries: vi.fn() }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/auth/sales-access', () => ({ requireSalesAccess: mocks.guard }));
vi.mock('@/services/sales/fleet-summary-service', () => ({ getFleetSummaries: mocks.summaries }));
beforeEach(() => { vi.resetAllMocks(); mocks.guard.mockResolvedValue({ user: { id: 'u' } }); });
describe('fleet summary action', () => {
    it('guards before service and handles denied roles', async () => {
        mocks.guard.mockRejectedValue(new BusinessRuleError('Forbidden'));
        expect(await getFleetOverview(['v'], '2026-09')).toMatchObject({ success: false });
        expect(mocks.summaries).not.toHaveBeenCalled();
    });
    it('deduplicates ids and passes month without allowing unbounded inputs', async () => {
        mocks.summaries.mockResolvedValue([]);
        expect(await getFleetOverview(['v', 'v'], '2026-09')).toMatchObject({ success: true, data: [] });
        expect(mocks.summaries).toHaveBeenCalledWith(['v'], '2026-09');
        expect(await getFleetOverview([''], '2026-09')).toMatchObject({ success: false });
        expect(await getFleetOverview(Array(1001).fill('v'), '2026-09')).toMatchObject({ success: false });
        expect(mocks.summaries).toHaveBeenCalledTimes(1);
    });
});
