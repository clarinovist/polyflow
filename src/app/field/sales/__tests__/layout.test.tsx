import { beforeEach, describe, expect, it, vi } from 'vitest';

const guard = vi.hoisted(() => vi.fn());
vi.mock('@/lib/mobile/mobile-portal-page-access', () => ({
    requireMobilePortalPageAccess: guard,
}));

import SalesFieldLayout from '../layout';

describe('Sales Field mobile layout guard', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        guard.mockResolvedValue({});
    });

    it('requires the sales-field portal contract before rendering', async () => {
        await expect(
            SalesFieldLayout({ children: <p>Konten sales</p> }),
        ).resolves.toBeTruthy();
        expect(guard).toHaveBeenCalledWith('sales-field');
    });
});
