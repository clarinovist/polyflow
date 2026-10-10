import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    auth: vi.fn(),
    context: vi.fn(),
    findUser: vi.fn(),
    updateUser: vi.fn(),
    audit: vi.fn(),
    revalidate: vi.fn(),
    compare: vi.fn(),
    hash: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: m.auth }));
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: never[]) => Promise<unknown>) => fn,
}));
vi.mock('@/lib/core/prisma', () => ({
    getTenantDbFromContext: m.context,
}));
vi.mock('@/lib/tools/audit', () => ({ logActivity: m.audit }));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }));
vi.mock('bcryptjs', () => ({ compare: m.compare, hash: m.hash }));

import {
    changeOwnPassword,
    logoutAllDevices,
    removeOwnAvatar,
    updateOwnProfile,
} from '../profile-actions';

const db = {
    user: {
        findUnique: m.findUser,
        update: m.updateUser,
    },
};

beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({ user: { id: 'actor-a' } });
    m.context.mockReturnValue(db);
    m.findUser.mockResolvedValue({
        id: 'actor-a',
        authMode: 'LOCAL',
        email: 'old@example.test',
        password: 'stored-hash',
        centralAccountId: null,
        isActive: true,
    });
    m.updateUser.mockResolvedValue({
        id: 'actor-a',
        name: 'Updated User',
        email: 'new@example.test',
        locale: 'en',
    });
    m.compare.mockResolvedValue(true);
    m.hash.mockResolvedValue('hashed-password');
});

describe('profile actions tenant boundary', () => {
    it.each([
        [updateOwnProfile, { name: 'Updated User', email: 'new@example.test', locale: 'en' }],
        [changeOwnPassword, { currentPassword: 'old-secret', newPassword: 'new-secret' }],
        [removeOwnAvatar, undefined],
        [logoutAllDevices, undefined],
    ] as const)('rejects %s before any user query when tenant context is absent', async (action, input) => {
        m.context.mockReturnValue(undefined);
        const result = input === undefined ? await action() : await action(input as never);
        expect(result).toMatchObject({ success: false, code: 'AUTHENTICATION_ERROR' });
        expect(m.findUser).not.toHaveBeenCalled();
        expect(m.updateUser).not.toHaveBeenCalled();
    });

    it('uses the explicit tenant client, audits, and revalidates desktop plus mobile', async () => {
        m.findUser
            .mockResolvedValueOnce({
                id: 'actor-a', authMode: 'LOCAL', email: 'old@example.test',
                password: 'stored-hash', centralAccountId: null, isActive: true,
            })
            .mockResolvedValueOnce(null);
        const result = await updateOwnProfile({
            name: 'Updated User',
            email: 'new@example.test',
            locale: 'en',
        });
        expect(result).toMatchObject({ success: true });
        expect(m.updateUser).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'actor-a' },
                data: {
                    name: 'Updated User',
                    email: 'new@example.test',
                    locale: 'en',
                },
            }),
        );
        expect(m.audit).toHaveBeenCalledWith({
            userId: 'actor-a',
            action: 'PROFILE_UPDATED',
            entityType: 'User',
            entityId: 'actor-a',
        });
        expect(m.revalidate).toHaveBeenCalledWith('/dashboard/settings');
        expect(m.revalidate).toHaveBeenCalledWith('/mobile/account');
    });

    it('keeps CENTRAL email immutable without attempting an update', async () => {
        m.findUser.mockResolvedValue({
            id: 'actor-a', authMode: 'CENTRAL', email: 'central@example.test',
            password: 'unused', centralAccountId: 'central-a', isActive: true,
        });
        const result = await updateOwnProfile({
            name: 'Central User',
            email: 'changed@example.test',
            locale: 'id',
        });
        expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(m.updateUser).not.toHaveBeenCalled();
    });

    it('lets CENTRAL users update mutable profile fields without writing email', async () => {
        m.findUser.mockResolvedValue({
            id: 'actor-a', authMode: 'CENTRAL', email: 'central@example.test',
            password: 'unused', centralAccountId: 'central-a', isActive: true,
        });
        m.updateUser.mockResolvedValue({
            id: 'actor-a',
            name: 'Central User',
            email: 'central@example.test',
            locale: 'en',
        });
        const result = await updateOwnProfile({
            name: 'Central User',
            email: 'central@example.test',
            locale: 'en',
        });
        expect(result).toMatchObject({ success: true });
        expect(m.updateUser).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { name: 'Central User', locale: 'en' },
            }),
        );
    });

    it('keeps CENTRAL password changes blocked', async () => {
        m.findUser.mockResolvedValue({
            id: 'actor-a', password: 'unused', authMode: 'CENTRAL',
            email: 'central@example.test', centralAccountId: 'central-a', isActive: true,
        });
        const result = await changeOwnPassword({
            currentPassword: 'old-secret',
            newPassword: 'new-secret',
        });
        expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(m.compare).not.toHaveBeenCalled();
        expect(m.updateUser).not.toHaveBeenCalled();
    });

    it('hashes and audits LOCAL password changes through the tenant client', async () => {
        m.findUser.mockResolvedValue({
            id: 'actor-a', password: 'stored-hash', authMode: 'LOCAL',
            email: 'old@example.test', centralAccountId: null, isActive: true,
        });
        const result = await changeOwnPassword({
            currentPassword: 'old-secret',
            newPassword: 'new-secret',
        });
        expect(result).toMatchObject({ success: true });
        expect(m.compare).toHaveBeenCalledWith('old-secret', 'stored-hash');
        expect(m.hash).toHaveBeenCalledWith('new-secret', 10);
        expect(m.updateUser).toHaveBeenCalledWith({
            where: { id: 'actor-a' },
            data: { password: 'hashed-password' },
        });
        expect(m.audit).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'PASSWORD_CHANGED' }),
        );
    });

    it.each([
        [updateOwnProfile, { name: 'Updated User', email: 'new@example.test', locale: 'en' }],
        [changeOwnPassword, { currentPassword: 'old-secret', newPassword: 'new-secret' }],
        [removeOwnAvatar, undefined],
        [logoutAllDevices, undefined],
    ] as const)('rejects inactive users before %s mutates', async (action, input) => {
        m.findUser.mockResolvedValue({
            id: 'actor-a', authMode: 'LOCAL', email: 'old@example.test',
            password: 'stored-hash', centralAccountId: null, isActive: false,
        });
        const result = input === undefined ? await action() : await action(input as never);
        expect(result).toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        expect(m.updateUser).not.toHaveBeenCalled();
        expect(m.audit).not.toHaveBeenCalled();
    });

    it('revalidates mobile account after removing an avatar', async () => {
        m.updateUser.mockResolvedValue({ id: 'actor-a', avatarUrl: null });
        const result = await removeOwnAvatar();
        expect(result).toMatchObject({ success: true });
        expect(m.revalidate).toHaveBeenCalledWith('/dashboard/settings');
        expect(m.revalidate).toHaveBeenCalledWith('/mobile/account');
    });
});
