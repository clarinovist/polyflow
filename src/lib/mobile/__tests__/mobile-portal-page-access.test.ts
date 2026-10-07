import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveAccess = vi.hoisted(() => vi.fn());
vi.mock('@/lib/mobile/mobile-portal-access', () => ({
    resolveMobilePortalAccess: resolveAccess,
}));
vi.mock('next/navigation', () => ({
    redirect: (path: string) => {
        throw new Error(`redirect:${path}`);
    },
}));

import { requireMobilePortalPageAccess } from '../mobile-portal-page-access';

describe('mobile portal page guard', () => {
    beforeEach(() => vi.resetAllMocks());

    it('returns an allowed portal decision', async () => {
        resolveAccess.mockResolvedValue({
            allowed: true,
            portal: { id: 'finance' },
            capabilities: [],
        });
        await expect(
            requireMobilePortalPageAccess('finance'),
        ).resolves.toMatchObject({ portal: { id: 'finance' } });
    });

    it('redirects Super Admin and impersonation decisions to desktop-required', async () => {
        resolveAccess.mockResolvedValue({
            allowed: false,
            reason: 'DESKTOP_ONLY',
        });
        await expect(requireMobilePortalPageAccess('admin')).rejects.toThrow(
            'redirect:/device/desktop-required?from=%2Fdashboard',
        );
    });

    it('redirects denial to the selector without a self-loop', async () => {
        resolveAccess.mockResolvedValue({
            allowed: false,
            reason: 'RESOURCE',
        });
        await expect(requireMobilePortalPageAccess('finance')).rejects.toThrow(
            'redirect:/mobile?reason=resource',
        );
    });
});
