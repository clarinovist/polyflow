import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    requireAuth: vi.fn(),
    getTenantDbFromContext: vi.fn(),
    userFindUnique: vi.fn(),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: mocks.requireAuth,
}));
vi.mock('@/lib/core/prisma', () => ({
    getTenantDbFromContext: mocks.getTenantDbFromContext,
}));

import { AuthorizationError } from '@/lib/errors/errors';
import {
    OWNER_HPP_ALLOWLIST_ENV,
    parseOwnerHppAllowlist,
    requireOwnerHppAccess,
} from '../owner-hpp-access';

const db = { user: { findUnique: mocks.userFindUnique } };

function dbUser(overrides: Record<string, unknown> = {}) {
    return {
        id: 'owner-1',
        isActive: true,
        isSuperAdmin: false,
        role: 'ADMIN',
        roles: [],
        tokenVersion: 3,
        ...overrides,
    };
}

function session(overrides: Record<string, unknown> = {}) {
    return {
        user: { id: 'owner-1', role: 'ADMIN', tokenVersion: 3, ...overrides },
    };
}

describe('parseOwnerHppAllowlist', () => {
    it('splits on commas, trims and drops empty entries', () => {
        expect([...parseOwnerHppAllowlist(' a-1 , b_2 ,, ')]).toEqual([
            'a-1',
            'b_2',
        ]);
    });

    it('drops entries with unsafe characters', () => {
        expect([...parseOwnerHppAllowlist("ok-1,bad id,x';--")]).toEqual([
            'ok-1',
        ]);
    });

    it('is empty when the variable is unset or blank', () => {
        expect(parseOwnerHppAllowlist(undefined).size).toBe(0);
        expect(parseOwnerHppAllowlist('   ').size).toBe(0);
    });
});

describe('requireOwnerHppAccess', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv(OWNER_HPP_ALLOWLIST_ENV, 'owner-1,owner-2');
        mocks.requireAuth.mockResolvedValue(session());
        mocks.getTenantDbFromContext.mockReturnValue(db);
        mocks.userFindUnique.mockResolvedValue(dbUser());
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('allows an active ADMIN whose id is on the allowlist', async () => {
        const access = await requireOwnerHppAccess();

        expect(access.userId).toBe('owner-1');
        expect(access.db).toBe(db);
    });

    it('allows ADMIN held through the multi-role list', async () => {
        mocks.userFindUnique.mockResolvedValue(
            dbUser({ role: 'FINANCE', roles: [{ role: 'ADMIN' }] }),
        );

        await expect(requireOwnerHppAccess()).resolves.toMatchObject({
            userId: 'owner-1',
        });
    });

    it('fails closed when the allowlist is unset', async () => {
        vi.stubEnv(OWNER_HPP_ALLOWLIST_ENV, '');

        await expect(requireOwnerHppAccess()).rejects.toBeInstanceOf(
            AuthorizationError,
        );
        expect(mocks.userFindUnique).not.toHaveBeenCalled();
    });

    it('rejects an ADMIN that is not on the allowlist', async () => {
        mocks.requireAuth.mockResolvedValue(session({ id: 'admin-9' }));

        await expect(requireOwnerHppAccess()).rejects.toBeInstanceOf(
            AuthorizationError,
        );
    });

    it('rejects a non-ADMIN even when listed', async () => {
        mocks.userFindUnique.mockResolvedValue(dbUser({ role: 'FINANCE' }));

        await expect(requireOwnerHppAccess()).rejects.toBeInstanceOf(
            AuthorizationError,
        );
    });

    it('rejects superadmin sessions', async () => {
        mocks.requireAuth.mockResolvedValue(session({ isSuperAdmin: true }));

        await expect(requireOwnerHppAccess()).rejects.toBeInstanceOf(
            AuthorizationError,
        );
    });

    it('rejects impersonated sessions carrying the owner id', async () => {
        mocks.requireAuth.mockResolvedValue(
            session({ impersonatedBy: 'super-1' }),
        );

        await expect(requireOwnerHppAccess()).rejects.toBeInstanceOf(
            AuthorizationError,
        );
        expect(mocks.userFindUnique).not.toHaveBeenCalled();
    });

    it('rejects an inactive account', async () => {
        mocks.userFindUnique.mockResolvedValue(dbUser({ isActive: false }));

        await expect(requireOwnerHppAccess()).rejects.toBeInstanceOf(
            AuthorizationError,
        );
    });

    it('rejects a missing user row', async () => {
        mocks.userFindUnique.mockResolvedValue(null);

        await expect(requireOwnerHppAccess()).rejects.toBeInstanceOf(
            AuthorizationError,
        );
    });

    it('rejects a revoked token (tokenVersion moved on)', async () => {
        mocks.userFindUnique.mockResolvedValue(dbUser({ tokenVersion: 4 }));

        await expect(requireOwnerHppAccess()).rejects.toBeInstanceOf(
            AuthorizationError,
        );
    });

    it('does not require a tokenVersion when the session carries none', async () => {
        mocks.requireAuth.mockResolvedValue(session({ tokenVersion: undefined }));

        await expect(requireOwnerHppAccess()).resolves.toMatchObject({
            userId: 'owner-1',
        });
    });

    it('rejects when there is no tenant database in context', async () => {
        mocks.getTenantDbFromContext.mockReturnValue(undefined);

        await expect(requireOwnerHppAccess()).rejects.toBeInstanceOf(
            AuthorizationError,
        );
    });
});
