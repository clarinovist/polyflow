// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Layout from '../layout';
const mocks = vi.hoisted(() => ({ pathname: '/production/mobile/material-orders', role: 'FACTORY_MANAGER', resources: ['/production/daily'] as string[] }));
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: 'manager', role: mocks.role, allowedResources: mocks.resources } }) }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error('redirect:' + path); } }));
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => mocks.pathname }) }));
vi.mock('@/actions/admin/permissions', () => ({ getMyPermissions: async () => ({ success: true, data: mocks.resources }) }));
vi.mock('@/lib/auth/central-workspaces', () => ({ getCentralWorkspaceOptions: async () => [] }));
vi.mock('@/lib/auth/access-policy', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/auth/access-policy')>(), hasWorkspaceEntitlement: () => true }));
vi.mock('@/components/production/production-sidebar', () => ({ ProductionSidebar: () => null }));
vi.mock('@/components/layout/path-breadcrumb', () => ({ PathBreadCrumb: () => null }));
vi.mock('@/app/kiosk/ClockDisplay', () => ({ ClockDisplay: () => null }));
beforeEach(() => { mocks.pathname = '/production/mobile/material-orders'; mocks.role = 'FACTORY_MANAGER'; mocks.resources = ['/production/daily']; });
describe('parent layout material review boundary', () => {
    it.each(['/production/mobile/material-orders', '/production/mobile/material-orders/11111111-1111-4111-8111-111111111111'])('delegates bounded %s to guarded nested mobile layout', async (pathname) => {
        mocks.pathname = pathname;
        await expect(Layout({ children: <div>nested guard remains</div> })).resolves.toBeTruthy();
    });
    it.each(['/production/mobile/material-orders/new', '/production/costing', '/production/mobile/tasks'])('does not open %s through the review exception', async (pathname) => {
        mocks.pathname = pathname;
        await expect(Layout({ children: null })).rejects.toThrow('redirect:');
    });
    it('requires a production grant before using the exception', async () => {
        mocks.resources = [];
        await expect(Layout({ children: null })).rejects.toThrow('redirect:');
    });
});
