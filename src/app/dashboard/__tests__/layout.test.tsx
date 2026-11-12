// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, getMyPermissions, redirect, headers } = vi.hoisted(() => ({
    auth: vi.fn(),
    getMyPermissions: vi.fn(),
    redirect: vi.fn((to: string) => {
        throw new Error(`NEXT_REDIRECT:${to}`);
    }),
    headers: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth }));
vi.mock('@/actions/admin/permissions', () => ({ getMyPermissions }));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next/headers', () => ({ headers }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: { user: { findUnique: vi.fn().mockResolvedValue(null) } },
    getMainPrisma: () => ({
        tenant: { findUnique: vi.fn().mockResolvedValue(null) },
    }),
}));
vi.mock('@/lib/auth/central-workspaces', () => ({
    getCentralWorkspaceOptions: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/components/layout/path-breadcrumb', () => ({
    PathBreadCrumb: () => null,
}));
vi.mock('@/components/layout/sidebar-spacer', () => ({
    SidebarSpacer: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
}));
vi.mock('@/components/layout/sidebar-nav', () => ({ SidebarNav: () => null }));
vi.mock('@/components/layout/skip-to-main-content', () => ({
    SkipToMainContent: () => null,
}));

import DashboardLayout from '../layout';

const factoryManager = {
    user: { id: 'u1', role: 'FACTORY_MANAGER', roles: ['FACTORY_MANAGER'] },
};

function setRequest(pathname: string, session: unknown, permissions: unknown) {
    auth.mockResolvedValue(session);
    headers.mockResolvedValue(new Headers({ 'x-pathname': pathname }));
    getMyPermissions.mockResolvedValue({ success: true, data: permissions });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('dashboard layout read-only Kepala Pabrik gate', () => {
    it('redirects FACTORY_MANAGER away from dashboard sub-routes covered by the /dashboard grant', async () => {
        setRequest('/dashboard/employees', factoryManager, ['/dashboard']);

        await expect(
            DashboardLayout({ children: <div>isi</div> }),
        ).rejects.toThrow('NEXT_REDIRECT:/dashboard');
    });

    it('lets FACTORY_MANAGER open the exact /dashboard route', async () => {
        setRequest('/dashboard', factoryManager, ['/dashboard']);

        const tree = await DashboardLayout({ children: <div>isi</div> });

        expect(() => render(tree)).not.toThrow();
        expect(redirect).not.toHaveBeenCalled();
    });

    it('keeps sub-routes open for ADMIN and for roles granted them', async () => {
        setRequest(
            '/dashboard/employees',
            { user: { id: 'u2', role: 'ADMIN', roles: ['ADMIN'] } },
            'ALL',
        );
        await expect(
            DashboardLayout({ children: <div>isi</div> }),
        ).resolves.toBeTruthy();

        setRequest(
            '/dashboard/products',
            { user: { id: 'u3', role: 'PLANNING', roles: ['PLANNING'] } },
            ['/dashboard/products'],
        );
        await expect(
            DashboardLayout({ children: <div>isi</div> }),
        ).resolves.toBeTruthy();
        expect(redirect).not.toHaveBeenCalled();
    });
});
