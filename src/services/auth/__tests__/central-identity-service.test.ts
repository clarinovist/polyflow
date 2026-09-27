import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CentralIdentityService,
    type CentralIdentityMainDb,
    type CentralIdentityTenantDb,
} from '@/services/auth/central-identity-service';

function mocks() {
    const mainTx = {
        tenantMembership: { update: vi.fn() },
        centralIdentityEvent: { create: vi.fn() },
    };
    const mainDb = {
        globalAccount: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        tenantMembership: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        $transaction: vi.fn(async (operation) => operation(mainTx)),
    } as unknown as CentralIdentityMainDb;
    const tenantDb = {
        user: {
            findUnique: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
        },
        $transaction: vi.fn(),
    } as unknown as CentralIdentityTenantDb;
    vi.mocked(tenantDb.$transaction).mockImplementation(async (operation) =>
        operation(tenantDb),
    );
    const loadTenantDb = vi.fn().mockResolvedValue(tenantDb);
    return { mainDb, mainTx, tenantDb, loadTenantDb };
}

const account = {
    id: 'account-a',
    issuer: 'https://identity.test',
    subject: 'subject-a',
    email: 'staff@example.test',
    emailVerified: true,
    status: 'ACTIVE',
    revocationVersion: 4,
    createdAt: new Date(0),
    updatedAt: new Date(0),
};

const membership = {
    id: 'membership-a',
    globalAccountId: account.id,
    tenantId: 'tenant-a',
    tenantUserId: 'local-user-a',
    status: 'ACTIVE',
    membershipVersion: 7,
    activatedAt: new Date(0),
    revokedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    tenant: { status: 'ACTIVE' },
};

const localUser = {
    id: membership.tenantUserId,
    isActive: true,
    authMode: 'CENTRAL',
    centralAccountId: account.id,
    centralAuthVersion: 2,
};

describe('CentralIdentityService', () => {
    beforeEach(() => vi.clearAllMocks());

    it('resolves an active account to exactly its tenant-local actor', async () => {
        const dependencies = mocks();
        vi.mocked(dependencies.mainDb.globalAccount.findUnique).mockResolvedValue(
            account as never,
        );
        vi.mocked(
            dependencies.mainDb.tenantMembership.findUnique,
        ).mockResolvedValue(membership as never);
        vi.mocked(dependencies.tenantDb.user.findUnique).mockResolvedValue(
            localUser as never,
        );

        const service = new CentralIdentityService(dependencies);
        await expect(
            service.resolveActiveBinding({
                issuer: account.issuer,
                subject: account.subject,
                tenantId: membership.tenantId,
            }),
        ).resolves.toEqual({
            globalAccountId: account.id,
            membershipId: membership.id,
            tenantId: membership.tenantId,
            tenantUserId: membership.tenantUserId,
            globalRevocationVersion: 4,
            membershipVersion: 7,
            localAuthVersion: 2,
        });
        expect(dependencies.loadTenantDb).toHaveBeenCalledWith('tenant-a');
    });

    it('does not infer tenant access when the explicit membership is absent', async () => {
        const dependencies = mocks();
        vi.mocked(dependencies.mainDb.globalAccount.findUnique).mockResolvedValue(
            account as never,
        );
        vi.mocked(
            dependencies.mainDb.tenantMembership.findUnique,
        ).mockResolvedValue(null);

        const service = new CentralIdentityService(dependencies);
        await expect(
            service.resolveActiveBinding({
                issuer: account.issuer,
                subject: account.subject,
                tenantId: 'tenant-b',
            }),
        ).rejects.toMatchObject({
            reason: 'MEMBERSHIP_NOT_FOUND',
        });
        expect(dependencies.loadTenantDb).not.toHaveBeenCalled();
    });

    it('rejects a membership whose local actor is bound to another account', async () => {
        const dependencies = mocks();
        vi.mocked(dependencies.mainDb.globalAccount.findUnique).mockResolvedValue(
            account as never,
        );
        vi.mocked(
            dependencies.mainDb.tenantMembership.findUnique,
        ).mockResolvedValue(membership as never);
        vi.mocked(dependencies.tenantDb.user.findUnique).mockResolvedValue({
            ...localUser,
            centralAccountId: 'other-account',
        } as never);

        const service = new CentralIdentityService(dependencies);
        await expect(
            service.resolveActiveBinding({
                issuer: account.issuer,
                subject: account.subject,
                tenantId: membership.tenantId,
            }),
        ).rejects.toMatchObject({
            reason: 'TENANT_BINDING_MISMATCH',
        });
    });

    it('invalidates a session when one tenant membership version changes', async () => {
        const dependencies = mocks();
        vi.mocked(dependencies.mainDb.globalAccount.findUnique).mockResolvedValue({
            status: 'ACTIVE',
            revocationVersion: 4,
        } as never);
        vi.mocked(
            dependencies.mainDb.tenantMembership.findUnique,
        ).mockResolvedValue({
            ...membership,
            membershipVersion: 8,
        } as never);

        const service = new CentralIdentityService(dependencies);
        await expect(
            service.validateSessionBinding({
                globalAccountId: account.id,
                membershipId: membership.id,
                tenantId: membership.tenantId,
                tenantUserId: membership.tenantUserId,
                globalRevocationVersion: 4,
                membershipVersion: 7,
                localAuthVersion: 2,
            }),
        ).rejects.toMatchObject({
            reason: 'SESSION_REVOKED',
        });
        expect(dependencies.loadTenantDb).not.toHaveBeenCalled();
    });

    it('revokes only the selected tenant membership and invalidates its local actor', async () => {
        const dependencies = mocks();
        vi.mocked(
            dependencies.mainDb.tenantMembership.findUnique,
        ).mockResolvedValue(membership as never);
        dependencies.mainTx.tenantMembership.update.mockResolvedValue({
            ...membership,
            status: 'REVOKED',
            membershipVersion: 8,
        });
        vi.mocked(dependencies.tenantDb.user.updateMany).mockResolvedValue({
            count: 1,
        } as never);

        const service = new CentralIdentityService(dependencies);
        await expect(
            service.revokeMembership({
                globalAccountId: account.id,
                tenantId: membership.tenantId,
            }),
        ).resolves.toEqual({ membershipId: membership.id, revoked: true });
        expect(
            dependencies.mainTx.tenantMembership.update,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: membership.id,
                    membershipVersion: 7,
                }),
                data: expect.objectContaining({
                    status: 'REVOKED',
                    membershipVersion: { increment: 1 },
                }),
            }),
        );
        expect(dependencies.tenantDb.user.updateMany).toHaveBeenCalledWith({
            where: {
                id: membership.tenantUserId,
                authMode: 'CENTRAL',
                centralAccountId: account.id,
            },
            data: {
                tokenVersion: { increment: 1 },
                centralAuthVersion: { increment: 1 },
            },
        });
    });

    it('treats an already revoked membership as an idempotent no-op', async () => {
        const dependencies = mocks();
        vi.mocked(
            dependencies.mainDb.tenantMembership.findUnique,
        ).mockResolvedValue({ ...membership, status: 'REVOKED' } as never);

        const service = new CentralIdentityService(dependencies);
        await expect(
            service.revokeMembership({
                globalAccountId: account.id,
                tenantId: membership.tenantId,
            }),
        ).resolves.toEqual({ membershipId: membership.id, revoked: false });
        expect(
            dependencies.mainTx.tenantMembership.update,
        ).not.toHaveBeenCalled();
        expect(dependencies.loadTenantDb).not.toHaveBeenCalled();
    });

    it('activates a pending link while preserving the local user id', async () => {
        const dependencies = mocks();
        vi.mocked(dependencies.mainDb.globalAccount.findUnique).mockResolvedValue(
            account as never,
        );
        vi.mocked(
            dependencies.mainDb.tenantMembership.findUnique,
        ).mockResolvedValue({
            ...membership,
            status: 'PENDING',
            membershipVersion: 0,
            tenant: { status: 'ACTIVE' },
        } as never);
        vi.mocked(dependencies.tenantDb.user.findUnique)
            .mockResolvedValueOnce({
                ...localUser,
                authMode: 'LOCAL',
                centralAccountId: null,
                centralAuthVersion: 0,
            } as never)
            .mockResolvedValueOnce({
                isActive: true,
                centralAccountId: null,
                centralAuthVersion: 0,
            } as never);
        vi.mocked(dependencies.tenantDb.user.update).mockResolvedValue({
            centralAuthVersion: 1,
        } as never);
        vi.mocked(dependencies.mainTx.tenantMembership.update).mockResolvedValue({
            ...membership,
            membershipVersion: 1,
        } as never);

        const service = new CentralIdentityService(dependencies);
        await expect(
            service.activateExistingUser({
                globalAccountId: account.id,
                tenantId: membership.tenantId,
                tenantUserId: membership.tenantUserId,
            }),
        ).resolves.toMatchObject({
            tenantUserId: membership.tenantUserId,
            localAuthVersion: 1,
            membershipVersion: 1,
        });
        expect(dependencies.tenantDb.user.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: membership.tenantUserId,
                    centralAuthVersion: 0,
                }),
                data: expect.objectContaining({
                    authMode: 'CENTRAL',
                    centralAccountId: account.id,
                    tokenVersion: { increment: 1 },
                }),
            }),
        );
    });

    it('fails closed when MAIN activation loses its compare-and-set race', async () => {
        const dependencies = mocks();
        vi.mocked(dependencies.mainDb.globalAccount.findUnique).mockResolvedValue(
            account as never,
        );
        vi.mocked(
            dependencies.mainDb.tenantMembership.findUnique,
        ).mockResolvedValue({
            ...membership,
            status: 'PENDING',
            membershipVersion: 0,
            tenant: { status: 'ACTIVE' },
        } as never);
        vi.mocked(dependencies.tenantDb.user.findUnique)
            .mockResolvedValueOnce({
                ...localUser,
                authMode: 'LOCAL',
                centralAccountId: null,
            } as never)
            .mockResolvedValueOnce({
                isActive: true,
                centralAccountId: null,
                centralAuthVersion: 0,
            } as never);
        vi.mocked(dependencies.tenantDb.user.update)
            .mockResolvedValueOnce({ centralAuthVersion: 1 } as never)
            .mockResolvedValueOnce({ centralAuthVersion: 2 } as never);
        vi.mocked(
            dependencies.mainTx.tenantMembership.update,
        ).mockRejectedValue(new Error('compare-and-set failed'));

        const service = new CentralIdentityService(dependencies);
        await expect(
            service.activateExistingUser({
                globalAccountId: account.id,
                tenantId: membership.tenantId,
                tenantUserId: membership.tenantUserId,
            }),
        ).rejects.toThrow('compare-and-set failed');
        expect(dependencies.tenantDb.user.update).toHaveBeenLastCalledWith({
            where: {
                id: membership.tenantUserId,
                centralAccountId: account.id,
            },
            data: {
                isActive: false,
                tokenVersion: { increment: 1 },
                centralAuthVersion: { increment: 1 },
            },
        });
    });
});
