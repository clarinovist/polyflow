import { AsyncLocalStorage } from 'node:async_hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadOutputReport } from '../load-report';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(), user: vi.fn(), assignments: vi.fn(), permissions: vi.fn(),
    getReport: vi.fn(), entitled: vi.fn(),
}));
const context = new AsyncLocalStorage<string>();
let tenant = 'tenant-test-a';
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/prisma', () => ({ prisma: {
    user: { findUnique: mocks.user }, userRole: { findMany: mocks.assignments },
    rolePermission: { findMany: mocks.permissions },
} }));
vi.mock('@/lib/core/tenant', () => ({
    withTenantPage: (fn: (...args: unknown[]) => Promise<unknown>) => (...args: unknown[]) => context.run(tenant, () => fn(...args)),
}));
vi.mock('@/services/production/production-output-report-service', () => ({ ProductionOutputReportService: { getReport: mocks.getReport } }));
vi.mock('@/lib/auth/access-policy', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/auth/access-policy')>(), hasWorkspaceEntitlement: mocks.entitled,
}));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

beforeEach(() => {
    vi.clearAllMocks();
    tenant = 'tenant-test-a';
    mocks.auth.mockResolvedValue({ user: { id: 'user-test', role: 'PRODUCTION' } });
    mocks.user.mockResolvedValue({ role: 'PRODUCTION', isActive: true, isSuperAdmin: false });
    mocks.assignments.mockResolvedValue([]);
    mocks.permissions.mockResolvedValue([{ resource: '/production/output-report' }]);
    mocks.entitled.mockReturnValue(true);
    mocks.getReport.mockImplementation(async () => ({ tenant: context.getStore() }));
});

describe('loadOutputReport access', () => {
    it('authorizes exact permission before fetch and runs DB reads in tenant context', async () => {
        mocks.user.mockImplementation(async () => {
            expect(context.getStore()).toBe('tenant-test-a');
            return { role: 'PRODUCTION', isActive: true, isSuperAdmin: false };
        });
        const data = await loadOutputReport({});
        expect(data).toMatchObject({ report: { tenant: 'tenant-test-a' }, canViewOrders: false });
        expect(mocks.permissions).toHaveBeenCalledWith({ where: { role: { in: ['PRODUCTION'] }, canAccess: true }, select: { resource: true } });
        expect(mocks.permissions.mock.invocationCallOrder[0]).toBeLessThan(mocks.getReport.mock.invocationCallOrder[0]);
    });
    it('keeps request contexts separate without caching payloads across tenants', async () => {
        const a = loadOutputReport({});
        tenant = 'tenant-test-b';
        const b = loadOutputReport({});
        const result = await Promise.all([a, b]);
        expect(result.map(r => r.report)).toEqual([{ tenant: 'tenant-test-a' }, { tenant: 'tenant-test-b' }]);
    });
    it.each(['/production', '/production/output-report'])('allows resource %s', async resource => {
        mocks.permissions.mockResolvedValue([{ resource }]);
        expect((await loadOutputReport({})).canViewOrders).toBe(resource === '/production');
    });
    it('uses fresh DB primary and assigned roles, including admin ALL semantics', async () => {
        mocks.assignments.mockResolvedValue([{ role: 'ADMIN' }]);
        expect((await loadOutputReport({})).canViewOrders).toBe(true);
        expect(mocks.permissions).not.toHaveBeenCalled();
    });
    it.each([{ resources: [] }, { resources: [{ resource: '/production/packing-monthly' }] }, { resources: [{ resource: '/production/output-report-other' }] }])('denies missing or unrelated resources %j', async ({ resources }) => {
        mocks.permissions.mockResolvedValue(resources);
        await expect(loadOutputReport({})).rejects.toThrow('redirect:/dashboard');
        expect(mocks.getReport).not.toHaveBeenCalled();
    });
    it('denies anonymous and superadmin sessions before account or report lookup', async () => {
        mocks.auth.mockResolvedValue(null);
        await expect(loadOutputReport({})).rejects.toThrow('redirect:/login');
        mocks.auth.mockResolvedValue({ user: { id: 'user-test', isSuperAdmin: true } });
        await expect(loadOutputReport({})).rejects.toThrow('redirect:/dashboard');
        expect(mocks.user).not.toHaveBeenCalled();
        expect(mocks.getReport).not.toHaveBeenCalled();
    });
    it.each([null, { isActive: false, role: 'ADMIN' }, { isActive: true, isSuperAdmin: true, role: 'ADMIN' }])('denies inactive/missing/platform account %j', async user => {
        mocks.user.mockResolvedValue(user);
        await expect(loadOutputReport({})).rejects.toThrow('redirect:/dashboard');
        expect(mocks.getReport).not.toHaveBeenCalled();
    });
    it('checks entitlement within tenant scope and fails closed on permission read error', async () => {
        mocks.entitled.mockReturnValue(false);
        await expect(loadOutputReport({})).rejects.toThrow('ModuleNotEntitled');
        expect(mocks.user).not.toHaveBeenCalled();
        mocks.entitled.mockReturnValue(true);
        mocks.permissions.mockRejectedValue(new Error('permission unavailable'));
        await expect(loadOutputReport({})).rejects.toThrow('permission unavailable');
        expect(mocks.getReport).not.toHaveBeenCalled();
    });
    it('rejects invalid URL before report query; never falls back to all data', async () => {
        await expect(loadOutputReport({ from: '2026-02-30' })).rejects.toThrow('Tanggal');
        expect(mocks.getReport).not.toHaveBeenCalled();
    });
});
