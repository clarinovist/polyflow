import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    guard: vi.fn(),
    permissions: vi.fn(),
    workspace: vi.fn(),
    resource: vi.fn(),
    reader: vi.fn(),
    prisma: {},
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
    hasWorkspaceResourceAccess: mocks.resource,
}));
vi.mock('@/lib/auth/roles', () => ({
    getUserRoles: (user: { role?: string; roles?: string[] }) =>
        user.roles ?? (user.role ? [user.role] : []),
}));
vi.mock('@/services/hrd/hrd-dashboard-service', () => ({
    readHrdDashboardAggregate: mocks.reader,
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

import { getHrdShiftBoard } from '../dashboard-kpis';

const aggregateFixture = {
    generatedAt: '2026-10-10T00:00:00.000Z',
    workDate: '2026-10-10',
    yesterdayWorkDate: '2026-10-09',
    health: {},
    attention: {},
    drivers: { status: 'NOT_CONFIGURED', data: null },
};

function setupAuthorized(role = 'HRD') {
    mocks.guard.mockResolvedValue({
        user: { id: 'u1', role, roles: [role], allowedResources: [] },
    });
    mocks.permissions.mockResolvedValue({ success: true, data: ['/hrd'] });
    mocks.workspace.mockReturnValue(true);
    mocks.resource.mockReturnValue(true);
    mocks.reader.mockResolvedValue(aggregateFixture);
}

describe('getHrdShiftBoard authorization', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        setupAuthorized();
    });

    it.each(['ADMIN', 'FINANCE', 'HRD'])(
        'allows tracked HRD root role %s with an exact root grant',
        async (role) => {
            setupAuthorized(role);

            const result = await getHrdShiftBoard();

            expect(result).toEqual({ success: true, data: aggregateFixture });
            expect(mocks.workspace).toHaveBeenCalledWith(
                expect.objectContaining({ roles: [role] }),
                'hrd',
                '/hrd',
            );
            expect(mocks.resource).toHaveBeenCalledWith(['/hrd'], 'hrd');
            expect(mocks.reader).toHaveBeenCalledWith(mocks.prisma);
        },
    );

    it('allows ALL permissions while keeping session resources isolated in policy input', async () => {
        mocks.permissions.mockResolvedValue({ success: true, data: 'ALL' });

        expect(await getHrdShiftBoard()).toMatchObject({ success: true });
        expect(mocks.workspace).toHaveBeenCalledWith(
            expect.objectContaining({ allowedResources: [] }),
            'hrd',
            '/hrd',
        );
        expect(mocks.resource).toHaveBeenCalledWith('ALL', 'hrd');
    });

    it('allows a cross-role or secondary-role user only when policy and explicit root grant allow it', async () => {
        mocks.guard.mockResolvedValue({
            user: {
                id: 'cross-role',
                role: 'SALES',
                roles: ['SALES', 'HRD'],
                allowedResources: [],
            },
        });

        expect(await getHrdShiftBoard()).toMatchObject({ success: true });
        expect(mocks.workspace).toHaveBeenCalledWith(
            expect.objectContaining({ roles: ['SALES', 'HRD'] }),
            'hrd',
            '/hrd',
        );
    });

    it.each([
        ['/hrd/attendance'],
        ['/warehouse'],
        [],
    ])('denies non-root resource %j before reading HRD data', async (...resources) => {
        mocks.permissions.mockResolvedValue({
            success: true,
            data: resources,
        });
        mocks.resource.mockReturnValue(resources[0]?.startsWith('/hrd') ?? false);

        const result = await getHrdShiftBoard();

        expect(result).toEqual({
            success: false,
            error: 'Unauthorized: Akses root HRD tidak tersedia.',
        });
        expect(mocks.reader).not.toHaveBeenCalled();
    });

    it('denies an unrelated role when the global policy rejects it', async () => {
        mocks.workspace.mockReturnValue(false);

        expect(await getHrdShiftBoard()).toMatchObject({ success: false });
        expect(mocks.reader).not.toHaveBeenCalled();
    });

    it('uses the session resource snapshot when the fresh permission read fails', async () => {
        mocks.guard.mockResolvedValue({
            user: {
                id: 'u1',
                role: 'HRD',
                roles: ['HRD'],
                allowedResources: ['/hrd'],
            },
        });
        mocks.permissions.mockResolvedValue({
            success: false,
            error: 'permission read failed',
        });

        expect(await getHrdShiftBoard()).toMatchObject({ success: true });
        expect(mocks.resource).toHaveBeenCalledWith(['/hrd'], 'hrd');
    });

    it('denies no session and super-admin isolation before reads', async () => {
        mocks.guard.mockRejectedValueOnce(new Error('Autentikasi diperlukan'));
        expect(await getHrdShiftBoard()).toMatchObject({ success: false });
        expect(mocks.reader).not.toHaveBeenCalled();

        setupAuthorized('SUPER_ADMIN');
        mocks.workspace.mockReturnValue(false);
        expect(await getHrdShiftBoard()).toMatchObject({ success: false });
        expect(mocks.reader).not.toHaveBeenCalled();
    });
});
