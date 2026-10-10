import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    prisma: {},
    guard: vi.fn(),
    permissions: vi.fn(),
    workspace: vi.fn(),
    resource: vi.fn(),
    entitled: vi.fn(),
    pathAllowed: vi.fn(),
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
    isPathAllowedByResources: mocks.pathAllowed,
}));
vi.mock('@/lib/auth/roles', () => ({
    getUserRoles: (user: { role?: string; roles?: string[] }) =>
        user.roles ?? (user.role ? [user.role] : []),
}));
vi.mock('@/services/maklon/maklon-dashboard-service', () => ({
    readMaklonDashboard: mocks.reader,
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

import { getMaklonDashboard } from '../maklon-dashboard';

const aggregateFixture = {
    generatedAt: '2026-10-10T00:00:00.000Z',
    snapshotAt: '2026-10-10T00:00:00.000Z',
    workDate: '2026-10-10',
    health: {},
    attention: {},
    drivers: { state: 'NOT_CONFIGURED', data: null },
    withheld: {
        materials: { state: 'NOT_CONFIGURED', data: null },
        financials: { state: 'NOT_CONFIGURED', data: null },
    },
};

function setupAuthorized(role = 'PLANNING') {
    mocks.guard.mockResolvedValue({
        user: { id: 'u1', role, roles: [role], allowedResources: [] },
    });
    mocks.permissions.mockResolvedValue({ success: true, data: ['/maklon'] });
    mocks.workspace.mockReturnValue(true);
    mocks.resource.mockReturnValue(true);
    mocks.entitled.mockReturnValue(true);
    mocks.pathAllowed.mockReturnValue(false);
    mocks.reader.mockResolvedValue(aggregateFixture);
}

describe('getMaklonDashboard authorization and links', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        setupAuthorized();
    });

    it.each(['ADMIN', 'PROCUREMENT', 'PLANNING'])(
        'allows Maklon root role %s with the exact root grant',
        async (role) => {
            setupAuthorized(role);

            const result = await getMaklonDashboard();

            expect(result).toEqual({
                success: true,
                data: {
                    ...aggregateFixture,
                    quickActionHrefs: [
                        '/maklon/receipts',
                        '/maklon/returns',
                        '/maklon/returns/create',
                    ],
                },
            });
            expect(mocks.workspace).toHaveBeenCalledWith(
                expect.objectContaining({ roles: [role] }),
                'maklon',
                '/maklon',
            );
            expect(mocks.resource).toHaveBeenCalledWith(['/maklon'], 'maklon');
            expect(mocks.reader).toHaveBeenCalledWith(mocks.prisma);
        },
    );

    it('allows an accepted secondary or cross-role only when policy and exact root grant allow it', async () => {
        mocks.guard.mockResolvedValue({
            user: {
                id: 'cross-role',
                role: 'SALES',
                roles: ['SALES', 'PLANNING'],
                allowedResources: [],
            },
        });

        expect(await getMaklonDashboard()).toMatchObject({ success: true });
        expect(mocks.workspace).toHaveBeenCalledWith(
            expect.objectContaining({ roles: ['SALES', 'PLANNING'] }),
            'maklon',
            '/maklon',
        );
    });

    it('allows ALL while keeping session resources isolated in policy input and emits covered Warehouse links', async () => {
        mocks.guard.mockResolvedValue({
            user: {
                id: 'admin',
                role: 'ADMIN',
                roles: ['ADMIN'],
                allowedResources: ['/session-only'],
            },
        });
        mocks.permissions.mockResolvedValue({ success: true, data: 'ALL' });
        mocks.pathAllowed.mockReturnValue(true);

        const result = await getMaklonDashboard();

        expect(result).toMatchObject({
            success: true,
            data: {
                quickActionHrefs: [
                    '/maklon/receipts',
                    '/maklon/returns',
                    '/maklon/returns/create',
                    '/warehouse/incoming/create-maklon',
                    '/warehouse',
                ],
            },
        });
        expect(mocks.workspace).toHaveBeenCalledWith(
            expect.objectContaining({
                roles: ['ADMIN'],
                allowedResources: ['/session-only'],
            }),
            'maklon',
            '/maklon',
        );
        expect(mocks.resource).toHaveBeenCalledWith('ALL', 'maklon');
    });

    it.each([['/maklon/receipts'], ['/warehouse'], []])(
        'denies non-root resource %j before any dashboard read',
        async (...resources) => {
            mocks.permissions.mockResolvedValue({
                success: true,
                data: resources,
            });
            mocks.resource.mockReturnValue(
                resources.some((resource) => resource.startsWith('/maklon')),
            );

            const result = await getMaklonDashboard();

            expect(result).toEqual({
                success: false,
                error: 'Unauthorized: Akses root Maklon tidak tersedia.',
            });
            expect(mocks.reader).not.toHaveBeenCalled();
            expect(mocks.pathAllowed).not.toHaveBeenCalled();
        },
    );

    it('denies a disabled Maklon entitlement before reads', async () => {
        mocks.entitled.mockImplementation(
            (workspace: string) => workspace !== 'maklon',
        );

        expect(await getMaklonDashboard()).toMatchObject({ success: false });
        expect(mocks.reader).not.toHaveBeenCalled();
        expect(mocks.pathAllowed).not.toHaveBeenCalled();
    });

    it('denies an unrelated role rejected by policy before reads', async () => {
        mocks.guard.mockResolvedValue({
            user: {
                id: 'warehouse-only',
                role: 'WAREHOUSE',
                roles: ['WAREHOUSE'],
                allowedResources: [],
            },
        });
        mocks.workspace.mockReturnValue(false);

        expect(await getMaklonDashboard()).toMatchObject({ success: false });
        expect(mocks.reader).not.toHaveBeenCalled();
    });

    it('uses the session resource snapshot when permission refresh fails', async () => {
        mocks.guard.mockResolvedValue({
            user: {
                id: 'u1',
                role: 'PLANNING',
                roles: ['PLANNING'],
                allowedResources: ['/maklon'],
            },
        });
        mocks.permissions.mockResolvedValue({
            success: false,
            error: 'permission read failed',
        });

        expect(await getMaklonDashboard()).toMatchObject({ success: true });
        expect(mocks.resource).toHaveBeenCalledWith(['/maklon'], 'maklon');
    });

    it('denies no session and super-admin isolation before reads', async () => {
        mocks.guard.mockRejectedValueOnce(new Error('Autentikasi diperlukan'));
        expect(await getMaklonDashboard()).toMatchObject({ success: false });
        expect(mocks.reader).not.toHaveBeenCalled();

        setupAuthorized('SUPER_ADMIN');
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
        expect(await getMaklonDashboard()).toMatchObject({ success: false });
        expect(mocks.reader).not.toHaveBeenCalled();
    });

    it('retains Maklon-local quick actions and emits each Warehouse link only with mutation-capable destination coverage', async () => {
        mocks.permissions.mockResolvedValue({
            success: true,
            data: ['/maklon', '/warehouse/incoming'],
        });
        mocks.pathAllowed.mockImplementation(
            (pathname: string) =>
                pathname === '/warehouse/incoming/create-maklon',
        );

        const result = await getMaklonDashboard();

        expect(result).toMatchObject({
            success: true,
            data: {
                quickActionHrefs: [
                    '/maklon/receipts',
                    '/maklon/returns',
                    '/maklon/returns/create',
                    '/warehouse/incoming/create-maklon',
                ],
            },
        });
        expect(mocks.pathAllowed).toHaveBeenNthCalledWith(
            1,
            '/warehouse/incoming/create-maklon',
            ['/maklon', '/warehouse/incoming'],
        );
        expect(mocks.pathAllowed).toHaveBeenNthCalledWith(2, '/warehouse', [
            '/maklon',
            '/warehouse/incoming',
        ]);
    });

    it('omits Warehouse links when Inventory entitlement is disabled even for ALL', async () => {
        mocks.permissions.mockResolvedValue({ success: true, data: 'ALL' });
        mocks.entitled.mockImplementation(
            (workspace: string) => workspace !== 'warehouse',
        );
        mocks.pathAllowed.mockReturnValue(true);

        const result = await getMaklonDashboard();

        expect(result).toMatchObject({
            success: true,
            data: {
                quickActionHrefs: [
                    '/maklon/receipts',
                    '/maklon/returns',
                    '/maklon/returns/create',
                ],
            },
        });
    });

    it('does not expose dead-end Warehouse links when coverage is absent', async () => {
        const result = await getMaklonDashboard();

        expect(result).toMatchObject({
            success: true,
            data: {
                quickActionHrefs: [
                    '/maklon/receipts',
                    '/maklon/returns',
                    '/maklon/returns/create',
                ],
            },
        });
        expect(
            JSON.stringify(result).includes(
                '/warehouse/incoming/create-maklon',
            ),
        ).toBe(false);
    });

    it('does not expose receipt creation for a child page grant that cannot submit to its parent resource action', async () => {
        mocks.permissions.mockResolvedValue({
            success: true,
            data: ['/maklon', '/warehouse/incoming/create-maklon'],
        });
        mocks.pathAllowed.mockReturnValue(true);

        const result = await getMaklonDashboard();

        expect(result).toMatchObject({
            success: true,
            data: {
                quickActionHrefs: [
                    '/maklon/receipts',
                    '/maklon/returns',
                    '/maklon/returns/create',
                ],
            },
        });
    });

    it('does not mistake a nested Warehouse grant for exact /warehouse root coverage', async () => {
        mocks.permissions.mockResolvedValue({
            success: true,
            data: ['/maklon', '/warehouse/inventory'],
        });
        mocks.pathAllowed.mockImplementation(
            (pathname: string) => pathname === '/warehouse',
        );

        const result = await getMaklonDashboard();

        expect(result).toMatchObject({
            success: true,
            data: {
                quickActionHrefs: [
                    '/maklon/receipts',
                    '/maklon/returns',
                    '/maklon/returns/create',
                ],
            },
        });
    });
});
