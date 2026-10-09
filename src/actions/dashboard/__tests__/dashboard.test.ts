import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    activeModules: vi.fn(),
    executive: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/auth/access-policy', () => ({
    getTenantActiveModules: mocks.activeModules,
    hasWorkspaceResourceAccess: (resources: string[] | undefined, workspace: string) =>
        resources?.some(
            (resource) =>
                resource === `/${workspace}` ||
                resource.startsWith(`/${workspace}/`),
        ) ?? false,
}));
vi.mock('@/services/dashboard/executive-stats-service', () => ({
    ExecutiveStatsService: { getExecutiveStats: mocks.executive },
}));

import { getExecutiveStats } from '../dashboard';

describe('getExecutiveStats action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.activeModules.mockReturnValue([
            'CORE',
            'SALES',
            'PURCHASING',
            'PRODUCTION',
            'INVENTORY',
            'FINANCE',
        ]);
        mocks.executive.mockResolvedValue({ generatedAt: '2026-10-09T00:00:00.000Z' });
    });

    it('requests all entitled sections for ADMIN', async () => {
        mocks.requireAuth.mockResolvedValue({
            user: { role: 'ADMIN', roles: ['ADMIN'] },
        });

        await getExecutiveStats();

        expect(mocks.executive).toHaveBeenCalledWith({
            sections: ['sales', 'purchasing', 'production', 'inventory', 'finance'],
            activeModules: ['CORE', 'SALES', 'PURCHASING', 'PRODUCTION', 'INVENTORY', 'FINANCE'],
        });
    });

    it('limits operational roles to their safe DTO sections', async () => {
        mocks.requireAuth.mockResolvedValue({
            user: { role: 'PRODUCTION', roles: ['PRODUCTION'] },
        });

        await getExecutiveStats();

        expect(mocks.executive).toHaveBeenCalledWith(
            expect.objectContaining({ sections: ['production', 'inventory'] }),
        );
    });

    it('includes a section granted through explicit resource permissions', async () => {
        mocks.requireAuth.mockResolvedValue({
            user: {
                role: 'SALES',
                roles: ['SALES'],
                allowedResources: ['/warehouse/inventory'],
            },
        });

        await getExecutiveStats();

        expect(mocks.executive).toHaveBeenCalledWith(
            expect.objectContaining({ sections: ['sales', 'inventory'] }),
        );
    });

    it('does not load any executive business section for HRD', async () => {
        mocks.requireAuth.mockResolvedValue({
            user: { role: 'HRD', roles: ['HRD'] },
        });

        await getExecutiveStats();

        expect(mocks.executive).toHaveBeenCalledWith(
            expect.objectContaining({ sections: [] }),
        );
    });
});
