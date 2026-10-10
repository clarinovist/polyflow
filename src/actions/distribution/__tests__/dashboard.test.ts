import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    prisma: {},
    guard: vi.fn(),
    permissions: vi.fn(),
    workspace: vi.fn(),
    resource: vi.fn(),
    entitled: vi.fn(),
    reader: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: never[]) => unknown) => fn,
}));
vi.mock('@/lib/tools/auth-checks', () => ({ requireAuth: mocks.guard }));
vi.mock('@/actions/admin/permissions', () => ({
    getMyPermissions: mocks.permissions,
}));
vi.mock('@/lib/auth/access-policy', () => ({
    canAccessWorkspace: mocks.workspace,
    hasWorkspaceEntitlement: mocks.entitled,
    hasWorkspaceResourceAccess: mocks.resource,
}));
vi.mock('@/lib/auth/roles', () => ({
    getUserRoles: (user: { role?: string; roles?: string[] }) =>
        user.roles ?? (user.role ? [user.role] : []),
}));
vi.mock('@/services/distribution/distribution-dashboard-service', () => ({
    readDistributionDashboard: mocks.reader,
}));
vi.mock('@/lib/errors/errors', () => ({
    AuthorizationError: class AuthorizationError extends Error {},
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            return { success: true as const, data: await fn() };
        } catch (error) {
            return {
                success: false as const,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
}));

import { getDistributionDashboard } from '../dashboard';

const aggregateFixture = {
    generatedAt: '2026-10-10T00:00:00.000Z',
    snapshotAt: '2026-10-10T00:00:00.000Z',
    businessDate: '2026-10-10',
    health: {},
    attention: {},
    drivers: { state: 'NOT_CONFIGURED', data: null },
    withheld: {
        operations: { state: 'NOT_CONFIGURED', data: null },
        financials: { state: 'NOT_CONFIGURED', data: null },
    },
};

function setupAuthorized(role = 'ADMIN', resources: string[] | 'ALL' = 'ALL') {
    mocks.guard.mockResolvedValue({
        user: {
            id: 'u1',
            role,
            roles: [role],
            allowedResources: [],
        },
    });
    mocks.permissions.mockResolvedValue({ success: true, data: resources });
    mocks.workspace.mockReturnValue(true);
    mocks.resource.mockReturnValue(true);
    mocks.entitled.mockReturnValue(true);
    mocks.reader.mockResolvedValue(aggregateFixture);
}

function lastProjection() {
    return mocks.reader.mock.calls.at(-1)?.[1];
}

describe('getDistributionDashboard authorization, projection, and links', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        setupAuthorized();
    });

    it.each(['ADMIN', 'SALES', 'MARKETING', 'PROCUREMENT'])(
        'allows Distribution root role %s only after exact root authorization',
        async (role) => {
            setupAuthorized(role);

            const result = await getDistributionDashboard();

            expect(result.success).toBe(true);
            expect(mocks.guard).toHaveBeenCalledTimes(1);
            expect(mocks.workspace).toHaveBeenCalledWith(
                expect.objectContaining({ roles: [role] }),
                'distribution',
                '/distribution',
            );
            expect(mocks.resource).toHaveBeenCalledWith('ALL', 'distribution');
            expect(mocks.reader).toHaveBeenCalledWith(
                mocks.prisma,
                {
                    salesOrders: '/sales/orders',
                    readyWithoutDo: '/sales/deliveries',
                    purchasingOrders: '/purchasing/orders',
                    inventory: '/warehouse/inventory',
                    accountsReceivable: '/sales/invoices',
                    accountsPayable: '/purchasing/invoices',
                },
                { snapshotAt: expect.any(Date) },
            );
        },
    );

    it('allows an explicit cross-role policy result but keeps destination domains resource-gated', async () => {
        setupAuthorized('WAREHOUSE', [
            '/distribution',
            '/warehouse/inventory',
        ]);

        const result = await getDistributionDashboard();

        expect(result.success).toBe(true);
        expect(lastProjection()).toEqual({
            salesOrders: null,
            readyWithoutDo: null,
            purchasingOrders: null,
            inventory: '/warehouse/inventory',
            accountsReceivable: null,
            accountsPayable: null,
        });
        expect(result).toMatchObject({
            data: { quickActionHrefs: ['/warehouse/inventory'] },
        });
        expect(JSON.stringify(result)).not.toContain('/sales/orders');
        expect(JSON.stringify(result)).not.toContain('/purchasing/orders');
        expect(JSON.stringify(result)).not.toContain('/sales/invoices');
    });

    it.each([
        [['/distribution/orders'], 'nested Distribution grant'],
        [['/sales/orders'], 'unrelated destination grant'],
        [[], 'empty resources'],
    ])('denies %s before any domain query', async (resources) => {
        setupAuthorized('SALES', resources as string[]);
        mocks.resource.mockReturnValue(
            (resources as string[]).some((item) =>
                item.startsWith('/distribution'),
            ),
        );

        const result = await getDistributionDashboard();

        expect(result).toMatchObject({
            success: false,
            error: 'Unauthorized: Akses root Distribution tidak tersedia.',
        });
        expect(mocks.reader).not.toHaveBeenCalled();
    });

    it('denies missing or inactive sessions before entitlement and domain reads', async () => {
        mocks.guard.mockRejectedValue(
            new Error('Autentikasi diperlukan atau akun tidak aktif'),
        );

        expect(await getDistributionDashboard()).toMatchObject({
            success: false,
            error: 'Autentikasi diperlukan atau akun tidak aktif',
        });
        expect(mocks.entitled).not.toHaveBeenCalled();
        expect(mocks.reader).not.toHaveBeenCalled();
    });

    it('denies an inactive Distribution entitlement before domain projection', async () => {
        mocks.entitled.mockImplementation(
            (workspace: string) => workspace !== 'distribution',
        );

        expect(await getDistributionDashboard()).toMatchObject({
            success: false,
        });
        expect(mocks.reader).not.toHaveBeenCalled();
    });

    it.each([
        [
            'sales',
            {
                salesOrders: null,
                readyWithoutDo: null,
                accountsReceivable: null,
            },
        ],
        [
            'purchasing',
            { purchasingOrders: null, accountsPayable: null },
        ],
        ['warehouse', { inventory: null }],
    ])(
        'keeps %s-owned sections hidden even with ALL when its module entitlement is inactive',
        async (inactiveWorkspace, expectedProjection) => {
            mocks.entitled.mockImplementation(
                (workspace: string) => workspace !== inactiveWorkspace,
            );

            const result = await getDistributionDashboard();

            expect(result.success).toBe(true);
            expect(lastProjection()).toMatchObject(expectedProjection);
        },
    );

    it('denies unrelated role policy and super-admin isolation before reads', async () => {
        mocks.workspace.mockReturnValue(false);
        setupAuthorized('HRD', ['/distribution']);
        mocks.workspace.mockReturnValue(false);
        expect(await getDistributionDashboard()).toMatchObject({
            success: false,
        });
        expect(mocks.reader).not.toHaveBeenCalled();

        vi.resetAllMocks();
        setupAuthorized('SUPER_ADMIN', 'ALL');
        mocks.guard.mockResolvedValue({
            user: {
                id: 'super',
                role: 'SUPER_ADMIN',
                roles: ['SUPER_ADMIN'],
                isSuperAdmin: true,
                allowedResources: [],
            },
        });
        mocks.workspace.mockReturnValue(false);
        expect(await getDistributionDashboard()).toMatchObject({
            success: false,
        });
        expect(mocks.reader).not.toHaveBeenCalled();
    });

    it('uses session resource fallback after refresh failure without expanding access', async () => {
        mocks.guard.mockResolvedValue({
            user: {
                id: 'u1',
                role: 'SALES',
                roles: ['SALES'],
                allowedResources: ['/distribution', '/sales/orders'],
            },
        });
        mocks.permissions.mockResolvedValue({
            success: false,
            error: 'permission read failed',
        });

        const result = await getDistributionDashboard();

        expect(result.success).toBe(true);
        expect(mocks.resource).toHaveBeenCalledWith(
            ['/distribution', '/sales/orders'],
            'distribution',
        );
        expect(lastProjection()).toEqual({
            salesOrders: '/sales/orders',
            readyWithoutDo: null,
            purchasingOrders: null,
            inventory: null,
            accountsReceivable: null,
            accountsPayable: null,
        });
    });

    it('fails permission refresh closed when the session has no resource fallback', async () => {
        mocks.guard.mockResolvedValue({
            user: {
                id: 'u1',
                role: 'SALES',
                roles: ['SALES'],
                allowedResources: [],
            },
        });
        mocks.permissions.mockResolvedValue({
            success: false,
            error: 'permission read failed',
        });
        mocks.resource.mockReturnValue(false);

        expect(await getDistributionDashboard()).toMatchObject({
            success: false,
        });
        expect(mocks.reader).not.toHaveBeenCalled();
    });

    it('keeps ALL from bypassing inactive owner entitlements', async () => {
        mocks.entitled.mockImplementation(
            (workspace: string) => workspace !== 'purchasing',
        );

        const result = await getDistributionDashboard();

        expect(result.success).toBe(true);
        expect(lastProjection()).toMatchObject({
            salesOrders: '/sales/orders',
            purchasingOrders: null,
            accountsPayable: null,
        });
        expect(result).toMatchObject({
            data: {
                quickActionHrefs: [
                    '/sales/orders',
                    '/sales/deliveries',
                    '/warehouse/inventory',
                    '/sales/invoices',
                ],
            },
        });
    });

    it.each([
        [
            ['/distribution', '/sales/orders'],
            { salesOrders: '/sales/orders', readyWithoutDo: null },
            ['/sales/orders'],
        ],
        [
            ['/distribution', '/sales/orders', '/sales/deliveries'],
            { salesOrders: '/sales/orders', readyWithoutDo: '/sales/deliveries' },
            ['/sales/orders', '/sales/deliveries'],
        ],
        [
            ['/distribution', '/purchasing/orders'],
            { purchasingOrders: '/purchasing/orders', accountsPayable: null },
            ['/purchasing/orders'],
        ],
        [
            ['/distribution', '/purchasing/invoices'],
            { purchasingOrders: null, accountsPayable: '/purchasing/invoices' },
            [],
        ],
        [
            ['/distribution', '/warehouse/inventory'],
            { inventory: '/warehouse/inventory' },
            ['/warehouse/inventory'],
        ],
        [
            ['/distribution', '/sales/invoices'],
            { accountsReceivable: '/sales/invoices' },
            ['/sales/invoices'],
        ],
    ])(
        'projects each owner domain from exact resource coverage %j and emits only safe legacy links',
        async (resources, expectedProjection, expectedLinks) => {
            setupAuthorized('ADMIN', resources as string[]);

            const result = await getDistributionDashboard();

            expect(lastProjection()).toMatchObject(expectedProjection);
            expect(result).toMatchObject({
                success: true,
                data: { quickActionHrefs: expectedLinks },
            });
            for (const [field, href] of [
                ['salesOrders', '/sales/orders'],
                ['readyWithoutDo', '/sales/deliveries'],
                ['purchasingOrders', '/purchasing/orders'],
                ['inventory', '/warehouse/inventory'],
                ['accountsReceivable', '/sales/invoices'],
                ['accountsPayable', '/purchasing/invoices'],
            ] as const) {
                if (lastProjection()[field] === null) {
                    expect(JSON.stringify(lastProjection())).not.toContain(
                        href,
                    );
                }
            }
        },
    );

    it('does not mistake nested descendants for exact destination coverage', async () => {
        setupAuthorized('ADMIN', [
            '/distribution',
            '/sales/orders/detail',
            '/purchasing/orders/detail',
            '/warehouse/inventory/balance',
        ]);

        const result = await getDistributionDashboard();

        expect(lastProjection()).toEqual({
            salesOrders: null,
            readyWithoutDo: null,
            purchasingOrders: null,
            inventory: null,
            accountsReceivable: null,
            accountsPayable: null,
        });
        expect(result).toMatchObject({
            data: { quickActionHrefs: [] },
        });
    });

    it('never queries feature or nominal permissions and preserves privacy-minimal payload ownership', async () => {
        await getDistributionDashboard();

        expect(mocks.permissions).toHaveBeenCalledTimes(1);
        expect(mocks.reader).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(mocks.reader.mock.calls)).not.toContain(
            'feature:view-prices',
        );
    });
});
