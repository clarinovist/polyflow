import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    guard: vi.fn(),
    readWorkspace: vi.fn(),
    notFound: vi.fn(() => {
        throw new Error('NEXT_NOT_FOUND');
    }),
}));

vi.mock('@/lib/core/tenant', () => ({ withTenantPage: (fn: unknown) => fn }));
vi.mock('@/lib/auth/owner-hpp-access', () => ({
    requireOwnerHppAccess: mocks.guard,
}));
vi.mock('@/actions/owner-hpp/owner-hpp-query', () => ({
    readOwnerHppWorkspace: mocks.readWorkspace,
}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('../OwnerHppClient', () => ({ OwnerHppClient: () => null }));

import { AuthorizationError } from '@/lib/errors/errors';
import OwnerHppPage, { dynamic, metadata } from '../page';

describe('/owner/hpp page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.guard.mockResolvedValue({ db: { marker: 'db' }, userId: 'u1' });
    });

    it('loads the signed-in owner workspace and hands it to the client', async () => {
        const stored = { workspace: { marker: 'ws' }, isStored: true };
        mocks.readWorkspace.mockResolvedValue(stored);

        const element = await OwnerHppPage();

        expect(mocks.readWorkspace).toHaveBeenCalledWith({ marker: 'db' }, 'u1');
        expect(element.props).toEqual({ initial: stored });
    });

    it('answers 404 to anyone who fails the guard, without reading data', async () => {
        mocks.guard.mockRejectedValue(new AuthorizationError('no'));

        await expect(OwnerHppPage()).rejects.toThrow('NEXT_NOT_FOUND');
        expect(mocks.readWorkspace).not.toHaveBeenCalled();
    });

    it('does not swallow unexpected failures as a 404', async () => {
        mocks.guard.mockRejectedValue(new Error('db down'));

        await expect(OwnerHppPage()).rejects.toThrow('db down');
        expect(mocks.notFound).not.toHaveBeenCalled();
    });

    it('is dynamic and kept out of search engines', () => {
        expect(dynamic).toBe('force-dynamic');
        expect(metadata.robots).toEqual({ index: false, follow: false });
    });
});
