import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    resolveAccess: vi.fn(),
    tenantScopeActive: false,
}));
vi.mock('@/lib/core/tenant', () => ({
    withTenantPage:
        (fn: (...args: never[]) => Promise<unknown>) =>
        async (...args: never[]) => {
            mocks.tenantScopeActive = true;
            try {
                return await fn(...args);
            } finally {
                mocks.tenantScopeActive = false;
            }
        },
}));
vi.mock('@/lib/mobile/mobile-portal-access', () => ({
    resolveMobilePortalAccess: (...args: unknown[]) =>
        mocks.resolveAccess(mocks.tenantScopeActive, ...args),
}));
vi.mock('next/navigation', () => ({
    redirect: (path: string) => {
        throw new Error(`redirect:${path}`);
    },
}));

import {
    requireMobilePortalPageAccess,
    resolveMobilePortalPageAccess,
} from '../mobile-portal-page-access';

describe('mobile portal page guard', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.tenantScopeActive = false;
    });

    it('resolves an allowed portal inside tenant scope', async () => {
        mocks.resolveAccess.mockResolvedValue({
            allowed: true,
            portal: { id: 'finance' },
            capabilities: [],
        });

        await expect(
            requireMobilePortalPageAccess('finance'),
        ).resolves.toMatchObject({ portal: { id: 'finance' } });
        expect(mocks.resolveAccess).toHaveBeenCalledWith(
            true,
            'finance',
            undefined,
        );
    });

    it('keeps capability reads inside the same tenant-scoped page entry point', async () => {
        mocks.resolveAccess.mockResolvedValue({
            allowed: false,
            reason: 'FEATURE',
        });

        await expect(
            resolveMobilePortalPageAccess(
                'production-supervisor',
                'feature:mobile-maintenance-approval',
            ),
        ).resolves.toEqual({ allowed: false, reason: 'FEATURE' });
        expect(mocks.resolveAccess).toHaveBeenCalledWith(
            true,
            'production-supervisor',
            'feature:mobile-maintenance-approval',
        );
    });

    it('redirects Super Admin and impersonation decisions to desktop-required', async () => {
        mocks.resolveAccess.mockResolvedValue({
            allowed: false,
            reason: 'DESKTOP_ONLY',
        });
        await expect(requireMobilePortalPageAccess('admin')).rejects.toThrow(
            'redirect:/device/desktop-required?from=%2Fdashboard',
        );
    });

    it('renders missing tenant context as a context problem, not revoked permission', async () => {
        mocks.resolveAccess.mockResolvedValue({
            allowed: false,
            reason: 'TENANT_CONTEXT',
        });
        await expect(
            requireMobilePortalPageAccess('warehouse'),
        ).rejects.toThrow('redirect:/mobile?reason=tenant_context');
    });

    it('redirects revoked resource denial to the selector without a self-loop', async () => {
        mocks.resolveAccess.mockResolvedValue({
            allowed: false,
            reason: 'RESOURCE',
        });
        await expect(requireMobilePortalPageAccess('finance')).rejects.toThrow(
            'redirect:/mobile?reason=resource',
        );
    });
});
