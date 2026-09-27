import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    TenantInvitationService,
    digestInvitationToken,
    normalizeIdentityEmail,
    type TenantInvitationMainDb,
    type TenantInvitationTenantDb,
} from '@/services/auth/tenant-invitation-service';

const NOW = new Date('2026-09-27T03:00:00.000Z');
const TOKEN = 'synthetic-invitation-token-that-is-long-enough-123456';

function mocks() {
    const tx = {
        globalAccount: { upsert: vi.fn() },
        tenantInvitation: {
            create: vi.fn(),
            updateMany: vi.fn(),
        },
        tenantMembership: { findUnique: vi.fn(), upsert: vi.fn() },
        centralIdentityEvent: { create: vi.fn() },
    };
    const mainDb = {
        tenant: { findUnique: vi.fn() },
        tenantInvitation: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
        },
        tenantMembership: { findUnique: vi.fn() },
        $transaction: vi.fn(async (operation) => operation(tx)),
    } as unknown as TenantInvitationMainDb;
    const tenantDb = {
        user: { findUnique: vi.fn() },
        userRole: { findFirst: vi.fn() },
    } as unknown as TenantInvitationTenantDb;
    const loadTenantDb = vi.fn().mockResolvedValue(tenantDb);
    const service = new TenantInvitationService({
        mainDb,
        loadTenantDb,
        now: () => NOW,
        randomToken: () => TOKEN,
    });
    return { service, mainDb, tenantDb, loadTenantDb, tx };
}

const tenantUser = {
    id: 'tenant-user-a',
    email: 'staff@example.test',
    isActive: true,
    isSuperAdmin: false,
    centralAccountId: null,
    role: 'FINANCE',
};

const invitation = {
    id: 'invite-a',
    tenantId: 'tenant-a',
    tenantUserId: tenantUser.id,
    recipientEmailNormalized: tenantUser.email,
    role: 'FINANCE',
    tokenDigest: digestInvitationToken(TOKEN),
    status: 'PENDING',
    expiresAt: new Date('2026-09-28T03:00:00.000Z'),
    acceptedByAccountId: null,
    acceptedAt: null,
    createdByUserId: 'admin-a',
    createdAt: NOW,
    updatedAt: NOW,
    tenant: { status: 'ACTIVE' },
};

const account = {
    id: 'account-a',
    issuer: 'https://identity.test',
    subject: 'subject-a',
    email: tenantUser.email,
    emailVerified: true,
    status: 'ACTIVE',
    revocationVersion: 0,
    createdAt: NOW,
    updatedAt: NOW,
};

describe('TenantInvitationService', () => {
    beforeEach(() => vi.clearAllMocks());

    it('normalizes email and hashes invitation tokens without storing plaintext', () => {
        expect(normalizeIdentityEmail('  Staff@Example.Test ')).toBe(
            'staff@example.test',
        );
        expect(digestInvitationToken(TOKEN)).toMatch(/^[a-f0-9]{64}$/);
        expect(digestInvitationToken(TOKEN)).not.toContain(TOKEN);
    });

    it('creates a single-use invitation for an existing tenant role', async () => {
        const dependencies = mocks();
        vi.mocked(dependencies.mainDb.tenant.findUnique).mockResolvedValue({
            id: 'tenant-a',
            status: 'ACTIVE',
        } as never);
        vi.mocked(dependencies.tenantDb.user.findUnique).mockResolvedValue(
            tenantUser as never,
        );
        vi.mocked(
            dependencies.mainDb.tenantInvitation.findFirst,
        ).mockResolvedValue(null);
        dependencies.tx.tenantInvitation.updateMany.mockResolvedValue({ count: 0 });
        dependencies.tx.tenantInvitation.create.mockResolvedValue({
            id: invitation.id,
            expiresAt: invitation.expiresAt,
        });

        await expect(
            dependencies.service.createInvitation({
                tenantId: 'tenant-a',
                tenantUserId: tenantUser.id,
                role: 'FINANCE',
                recipientEmail: ' Staff@Example.Test ',
                actor: { userId: 'admin-a' },
            }),
        ).resolves.toEqual({
            invitationId: invitation.id,
            token: TOKEN,
            expiresAt: new Date('2026-10-04T03:00:00.000Z'),
        });
        expect(dependencies.tx.tenantInvitation.updateMany).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-a',
                tenantUserId: tenantUser.id,
                status: 'PENDING',
                expiresAt: { lte: NOW },
            },
            data: { status: 'EXPIRED' },
        });
        expect(dependencies.tx.tenantInvitation.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    recipientEmailNormalized: tenantUser.email,
                    tokenDigest: digestInvitationToken(TOKEN),
                    createdByUserId: 'admin-a',
                }),
            }),
        );
        expect(
            dependencies.tx.tenantInvitation.create.mock.calls[0][0].data,
        ).not.toHaveProperty('token');
        expect(dependencies.tx.centralIdentityEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    action: 'TENANT_INVITATION_CREATED',
                    actorId: 'admin-a',
                }),
            }),
        );
    });

    it('allows a fresh invite after the same bound membership was revoked', async () => {
        const dependencies = mocks();
        vi.mocked(dependencies.mainDb.tenant.findUnique).mockResolvedValue({
            id: 'tenant-a',
            status: 'ACTIVE',
        } as never);
        vi.mocked(dependencies.tenantDb.user.findUnique).mockResolvedValue({
            ...tenantUser,
            centralAccountId: account.id,
        } as never);
        vi.mocked(
            dependencies.mainDb.tenantMembership.findUnique,
        ).mockResolvedValue({ status: 'REVOKED' } as never);
        vi.mocked(
            dependencies.mainDb.tenantInvitation.findFirst,
        ).mockResolvedValue(null);
        dependencies.tx.tenantInvitation.updateMany.mockResolvedValue({ count: 0 });
        dependencies.tx.tenantInvitation.create.mockResolvedValue({
            id: invitation.id,
            expiresAt: invitation.expiresAt,
        });

        await expect(
            dependencies.service.createInvitation({
                tenantId: 'tenant-a',
                tenantUserId: tenantUser.id,
                role: 'FINANCE',
                recipientEmail: tenantUser.email,
                actor: { userId: 'admin-a' },
            }),
        ).resolves.toMatchObject({ invitationId: invitation.id });
    });

    it('rejects invitation when email does not match the tenant actor', async () => {
        const dependencies = mocks();
        vi.mocked(dependencies.mainDb.tenant.findUnique).mockResolvedValue({
            id: 'tenant-a',
            status: 'ACTIVE',
        } as never);
        vi.mocked(dependencies.tenantDb.user.findUnique).mockResolvedValue(
            tenantUser as never,
        );

        await expect(
            dependencies.service.createInvitation({
                tenantId: 'tenant-a',
                tenantUserId: tenantUser.id,
                role: 'FINANCE',
                recipientEmail: 'other@example.test',
                actor: { userId: 'admin-a' },
            }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
        expect(dependencies.mainDb.$transaction).not.toHaveBeenCalled();
    });

    it('creates the central account from a verified invitation identity', async () => {
        const dependencies = mocks();
        vi.mocked(
            dependencies.mainDb.tenantInvitation.findUnique,
        ).mockResolvedValue(invitation as never);
        vi.mocked(dependencies.tx.globalAccount.upsert).mockResolvedValue(
            account as never,
        );
        vi.mocked(
            dependencies.tx.tenantMembership.findUnique,
        ).mockResolvedValue(null);
        dependencies.tx.tenantInvitation.updateMany.mockResolvedValue({ count: 1 });
        dependencies.tx.tenantMembership.upsert.mockResolvedValue({
            id: 'membership-a',
        });

        await dependencies.service.acceptInvitation({
            token: TOKEN,
            expectedTenantId: invitation.tenantId,
            identity: {
                issuer: account.issuer,
                subject: account.subject,
                email: account.email,
                emailVerified: true,
            },
        });

        expect(dependencies.tx.globalAccount.upsert).toHaveBeenCalledWith({
            where: {
                issuer_subject: {
                    issuer: account.issuer,
                    subject: account.subject,
                },
            },
            create: {
                issuer: account.issuer,
                subject: account.subject,
                email: account.email,
                emailVerified: true,
            },
            update: {
                email: account.email,
                emailVerified: true,
            },
        });
    });

    it('accepts a verified matching identity and creates only a pending membership', async () => {
        const dependencies = mocks();
        vi.mocked(
            dependencies.mainDb.tenantInvitation.findUnique,
        ).mockResolvedValue(invitation as never);
        vi.mocked(
            dependencies.tx.globalAccount.upsert,
        ).mockResolvedValue(account as never);
        vi.mocked(
            dependencies.tx.tenantMembership.findUnique,
        ).mockResolvedValue(null);
        dependencies.tx.tenantInvitation.updateMany.mockResolvedValue({ count: 1 });
        dependencies.tx.tenantMembership.upsert.mockResolvedValue({
            id: 'membership-a',
        });

        await expect(
            dependencies.service.acceptInvitation({
                token: TOKEN,
                expectedTenantId: invitation.tenantId,
                identity: {
                    issuer: account.issuer,
                    subject: account.subject,
                    email: 'STAFF@example.test',
                    emailVerified: true,
                },
            }),
        ).resolves.toEqual({
            invitationId: invitation.id,
            globalAccountId: account.id,
            tenantId: invitation.tenantId,
            tenantUserId: invitation.tenantUserId,
            membershipId: 'membership-a',
        });
        expect(dependencies.tx.tenantMembership.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({ status: 'PENDING' }),
                update: {},
            }),
        );
    });

    it('does not consume an invitation on a different tenant host', async () => {
        const dependencies = mocks();
        vi.mocked(
            dependencies.mainDb.tenantInvitation.findUnique,
        ).mockResolvedValue(invitation as never);

        await expect(
            dependencies.service.acceptInvitation({
                token: TOKEN,
                expectedTenantId: 'tenant-b',
                identity: {
                    issuer: account.issuer,
                    subject: account.subject,
                    email: account.email,
                    emailVerified: true,
                },
            }),
        ).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
        expect(dependencies.mainDb.$transaction).not.toHaveBeenCalled();
    });

    it('does not consume an invitation for an unverified or different email', async () => {
        const dependencies = mocks();
        vi.mocked(
            dependencies.mainDb.tenantInvitation.findUnique,
        ).mockResolvedValue(invitation as never);

        await expect(
            dependencies.service.acceptInvitation({
                token: TOKEN,
                expectedTenantId: invitation.tenantId,
                identity: {
                    issuer: account.issuer,
                    subject: account.subject,
                    email: 'other@example.test',
                    emailVerified: true,
                },
            }),
        ).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
        expect(dependencies.tx.globalAccount.upsert).not.toHaveBeenCalled();
        expect(dependencies.mainDb.$transaction).not.toHaveBeenCalled();
    });

    it('expires a stale invitation instead of creating membership access', async () => {
        const dependencies = mocks();
        vi.mocked(
            dependencies.mainDb.tenantInvitation.findUnique,
        ).mockResolvedValue({
            ...invitation,
            expiresAt: new Date('2026-09-26T03:00:00.000Z'),
        } as never);
        dependencies.tx.tenantInvitation.updateMany.mockResolvedValue({ count: 1 });

        await expect(
            dependencies.service.acceptInvitation({
                token: TOKEN,
                expectedTenantId: invitation.tenantId,
                identity: {
                    issuer: account.issuer,
                    subject: account.subject,
                    email: account.email,
                    emailVerified: true,
                },
            }),
        ).rejects.toThrow('Undangan sudah berakhir.');
        expect(dependencies.tx.tenantInvitation.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: { status: 'EXPIRED' } }),
        );
        expect(dependencies.tx.tenantMembership.upsert).not.toHaveBeenCalled();
    });

    it('fails a replay race when compare-and-set no longer owns the invitation', async () => {
        const dependencies = mocks();
        vi.mocked(
            dependencies.mainDb.tenantInvitation.findUnique,
        ).mockResolvedValue(invitation as never);
        vi.mocked(
            dependencies.tx.globalAccount.upsert,
        ).mockResolvedValue(account as never);
        vi.mocked(
            dependencies.tx.tenantMembership.findUnique,
        ).mockResolvedValue(null);
        dependencies.tx.tenantInvitation.updateMany.mockResolvedValue({ count: 0 });

        await expect(
            dependencies.service.acceptInvitation({
                token: TOKEN,
                expectedTenantId: invitation.tenantId,
                identity: {
                    issuer: account.issuer,
                    subject: account.subject,
                    email: account.email,
                    emailVerified: true,
                },
            }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
        expect(dependencies.tx.tenantMembership.upsert).not.toHaveBeenCalled();
    });

    it('rejects a second local actor for the same account and tenant', async () => {
        const dependencies = mocks();
        vi.mocked(
            dependencies.mainDb.tenantInvitation.findUnique,
        ).mockResolvedValue(invitation as never);
        vi.mocked(
            dependencies.tx.globalAccount.upsert,
        ).mockResolvedValue(account as never);
        vi.mocked(
            dependencies.tx.tenantMembership.findUnique,
        ).mockResolvedValue({
            id: 'existing-membership',
            tenantUserId: 'different-user',
            status: 'ACTIVE',
        } as never);

        await expect(
            dependencies.service.acceptInvitation({
                token: TOKEN,
                expectedTenantId: invitation.tenantId,
                identity: {
                    issuer: account.issuer,
                    subject: account.subject,
                    email: account.email,
                    emailVerified: true,
                },
            }),
        ).rejects.toMatchObject({ code: 'CONFLICT' });
        expect(dependencies.mainDb.$transaction).toHaveBeenCalledOnce();
        expect(dependencies.tx.tenantInvitation.updateMany).not.toHaveBeenCalled();
        expect(dependencies.tx.tenantMembership.upsert).not.toHaveBeenCalled();
    });
});
