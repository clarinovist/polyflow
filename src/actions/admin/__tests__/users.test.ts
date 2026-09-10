import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    userFindUnique: vi.fn(),
    userFindFirst: vi.fn(),
    userCount: vi.fn(),
    txUserUpdate: vi.fn(),
    transaction: vi.fn(),
    unassignAll: vi.fn(),
    logActivity: vi.fn(),
    invalidatePermissionsCache: vi.fn(),
    revalidatePath: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: {
            findUnique: mocks.userFindUnique,
            findFirst: mocks.userFindFirst,
            count: mocks.userCount,
        },
        $transaction: mocks.transaction,
    },
}));
vi.mock('@/lib/auth/roles', () => ({ isTenantAdmin: vi.fn(() => true) }));
vi.mock('@/lib/auth/permissions-cache', () => ({
    invalidatePermissionsCache: mocks.invalidatePermissionsCache,
}));
vi.mock('@/services/sales/customer-assignment-service', () => ({
    unassignAllCustomersFromUser: mocks.unassignAll,
}));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.logActivity }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { deleteUser } from '../users';

describe('deleteUser', () => {
    const tx = {
        user: { update: mocks.txUserUpdate },
        auditLog: { create: vi.fn() },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({
            user: { id: 'admin-1', role: 'ADMIN', roles: ['ADMIN'] },
        });
        mocks.userFindUnique
            .mockResolvedValueOnce({ id: 'admin-1', isActive: true })
            .mockResolvedValueOnce({
                id: 'sales-1',
                email: 'sales@example.test',
                isActive: true,
                isSuperAdmin: false,
                role: 'SALES',
            });
        mocks.userCount.mockResolvedValue(2);
        mocks.userFindFirst.mockResolvedValue(null);
        mocks.txUserUpdate.mockResolvedValue({ id: 'sales-1' });
        mocks.unassignAll.mockResolvedValue(2);
        mocks.logActivity.mockResolvedValue(undefined);
        mocks.transaction.mockImplementation(
            async (callback: (client: typeof tx) => Promise<unknown>) =>
                callback(tx),
        );
    });

    it('deactivates and unassigns customers in the same transaction', async () => {
        const result = await deleteUser('sales-1');

        expect(result.success).toBe(true);
        expect(mocks.txUserUpdate).toHaveBeenCalledWith({
            where: { id: 'sales-1' },
            data: { isActive: false },
        });
        expect(mocks.unassignAll).toHaveBeenCalledWith(
            'sales-1',
            'admin-1',
            tx,
        );
        expect(mocks.logActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'DEACTIVATE_USER',
                entityId: 'sales-1',
                tx,
            }),
        );
        expect(mocks.invalidatePermissionsCache).toHaveBeenCalledWith({
            userId: 'sales-1',
        });
    });

    it('aborts the transaction and post-commit effects when unassign fails', async () => {
        mocks.unassignAll.mockRejectedValue(new Error('unassign failed'));

        const result = await deleteUser('sales-1');

        expect(result.success).toBe(false);
        expect(mocks.transaction).toHaveBeenCalledTimes(1);
        expect(mocks.logActivity).not.toHaveBeenCalled();
        expect(mocks.invalidatePermissionsCache).not.toHaveBeenCalled();
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });
});
