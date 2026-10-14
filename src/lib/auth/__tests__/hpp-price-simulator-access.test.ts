import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    getTenantDbFromContext: vi.fn(),
    userFindUnique: vi.fn(),
    rolePermissionFindMany: vi.fn(),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: mocks.requireAuth,
}));
vi.mock('@/lib/core/prisma', () => ({
    getTenantDbFromContext: mocks.getTenantDbFromContext,
}));

import {
    HPP_PRICE_SIMULATOR_FEATURE,
    HPP_PRICE_SIMULATOR_RESOURCE,
    canAccessHppPriceSimulator,
    requireHppPriceSimulatorAccess,
} from '../hpp-price-simulator-access';
import { canSeeHppPriceSimulatorShortcut } from '../hpp-price-simulator-visibility';

const db = {
    user: { findUnique: mocks.userFindUnique },
    rolePermission: { findMany: mocks.rolePermissionFindMany },
    productVariant: {},
    bom: {},
};

function user(
    role: string | null,
    roles: string[] = [],
    overrides: Record<string, unknown> = {},
) {
    return {
        id: `${role?.toLowerCase() ?? 'no-role'}-1`,
        isActive: true,
        isSuperAdmin: false,
        role,
        roles: roles.map((assignedRole) => ({ role: assignedRole })),
        ...overrides,
    };
}

function grants(resources: string[]) {
    mocks.rolePermissionFindMany.mockResolvedValue(
        resources.map((resource) => ({ resource })),
    );
}

describe('HPP price simulator access', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.requireAuth.mockResolvedValue({
            user: { id: 'user-1', role: 'FINANCE' },
        });
        mocks.getTenantDbFromContext.mockReturnValue(db);
        mocks.userFindUnique.mockResolvedValue(user('FINANCE'));
        grants([]);
    });

    it('allows active tenant ADMIN without permission rows', async () => {
        mocks.userFindUnique.mockResolvedValue(user('ADMIN'));

        await expect(requireHppPriceSimulatorAccess()).resolves.toMatchObject({
            db,
            roles: ['ADMIN'],
        });
        expect(mocks.rolePermissionFindMany).not.toHaveBeenCalled();
    });

    it.each([
        {
            name: 'exact parent resource and feature',
            resources: [
                HPP_PRICE_SIMULATOR_RESOURCE,
                HPP_PRICE_SIMULATOR_FEATURE,
            ],
        },
        {
            name: 'production parent resource and feature',
            resources: ['/production', HPP_PRICE_SIMULATOR_FEATURE],
        },
    ])('allows FINANCE only with $name', async ({ resources }) => {
        grants(resources);

        await expect(requireHppPriceSimulatorAccess()).resolves.toMatchObject({
            roles: ['FINANCE'],
        });
        expect(mocks.rolePermissionFindMany).toHaveBeenCalledWith({
            where: { role: { in: ['FINANCE'] }, canAccess: true },
            select: { resource: true },
        });
    });

    it.each([
        {
            name: 'resource without feature',
            resources: [HPP_PRICE_SIMULATOR_RESOURCE],
        },
        {
            name: 'feature without resource',
            resources: [HPP_PRICE_SIMULATOR_FEATURE],
        },
        { name: 'unrelated grants', resources: ['/finance'] },
        { name: 'ALL without explicit feature', resources: ['ALL'] },
    ])('denies FINANCE with $name', async ({ resources }) => {
        grants(resources);
        await expect(requireHppPriceSimulatorAccess()).rejects.toThrow(
            /Analisis Biaya.*melihat harga/i,
        );
    });

    it('denies FACTORY_MANAGER even when both grants exist', async () => {
        mocks.userFindUnique.mockResolvedValue(user('FACTORY_MANAGER'));
        grants([
            HPP_PRICE_SIMULATOR_RESOURCE,
            HPP_PRICE_SIMULATOR_FEATURE,
        ]);

        await expect(requireHppPriceSimulatorAccess()).rejects.toThrow(
            /Factory Manager/i,
        );
        expect(mocks.rolePermissionFindMany).not.toHaveBeenCalled();
    });

    it.each([
        ['missing tenant context', () => {
            mocks.getTenantDbFromContext.mockReturnValue(undefined);
        }],
        ['super-admin session', () => {
            mocks.requireAuth.mockResolvedValue({
                user: { id: 'super-1', role: 'ADMIN', isSuperAdmin: true },
            });
        }],
        ['missing user', () => {
            mocks.userFindUnique.mockResolvedValue(null);
        }],
        ['inactive user', () => {
            mocks.userFindUnique.mockResolvedValue(
                user('FINANCE', [], { isActive: false }),
            );
        }],
        ['tenant super-admin row', () => {
            mocks.userFindUnique.mockResolvedValue(
                user('ADMIN', [], { isSuperAdmin: true }),
            );
        }],
        ['no role', () => {
            mocks.userFindUnique.mockResolvedValue(user(null));
        }],
    ] as const)('fails closed for %s', async (_name, arrange) => {
        arrange();

        await expect(requireHppPriceSimulatorAccess()).rejects.toThrow();
        expect(mocks.rolePermissionFindMany).not.toHaveBeenCalled();
    });

    it('uses the same fail-closed access contract for shortcut capability', async () => {
        grants([
            HPP_PRICE_SIMULATOR_RESOURCE,
            HPP_PRICE_SIMULATOR_FEATURE,
        ]);
        await expect(canAccessHppPriceSimulator()).resolves.toBe(true);

        grants([HPP_PRICE_SIMULATOR_RESOURCE]);
        await expect(canAccessHppPriceSimulator()).resolves.toBe(false);
    });

    it('checks both gates before rendering a shortcut and never treats ALL as the nominal feature', () => {
        expect(
            canSeeHppPriceSimulatorShortcut(
                [HPP_PRICE_SIMULATOR_RESOURCE, HPP_PRICE_SIMULATOR_FEATURE],
                ['FINANCE'],
            ),
        ).toBe(true);
        expect(
            canSeeHppPriceSimulatorShortcut(
                [HPP_PRICE_SIMULATOR_RESOURCE],
                ['FINANCE'],
            ),
        ).toBe(false);
        expect(canSeeHppPriceSimulatorShortcut('ALL', ['FINANCE'])).toBe(false);
        expect(canSeeHppPriceSimulatorShortcut('ALL', ['ADMIN'])).toBe(true);
        expect(
            canSeeHppPriceSimulatorShortcut(
                [HPP_PRICE_SIMULATOR_RESOURCE, HPP_PRICE_SIMULATOR_FEATURE],
                ['FACTORY_MANAGER'],
            ),
        ).toBe(false);
    });

    it('keeps the strict guard failing while the optional capability fails closed', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);
        mocks.rolePermissionFindMany.mockRejectedValue(
            new Error('synthetic lookup failure'),
        );

        await expect(requireHppPriceSimulatorAccess()).rejects.toThrow(
            /synthetic lookup failure/,
        );
        await expect(canAccessHppPriceSimulator()).resolves.toBe(false);
        expect(consoleError).toHaveBeenCalledWith(
            expect.stringContaining('Capability lookup failed'),
            expect.any(Error),
        );
        consoleError.mockRestore();
    });
});
