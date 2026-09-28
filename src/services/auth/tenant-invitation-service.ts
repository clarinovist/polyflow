import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient, Role } from '@prisma/client';
import {
    BusinessRuleError,
    ConflictError,
    NotFoundError,
} from '@/lib/errors/errors';

const PENDING = 'PENDING' as const;
const ACTIVE = 'ACTIVE' as const;
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface TenantInvitationMainDb {
    tenant: Pick<PrismaClient['tenant'], 'findUnique'>;
    tenantInvitation: Pick<
        PrismaClient['tenantInvitation'],
        'findFirst' | 'findUnique'
    >;
    tenantMembership: Pick<PrismaClient['tenantMembership'], 'findUnique'>;
    $transaction<T>(
        operation: (tx: TenantInvitationTransaction) => Promise<T>,
    ): Promise<T>;
}

export interface TenantInvitationTransaction {
    globalAccount: Pick<PrismaClient['globalAccount'], 'upsert'>;
    tenantInvitation: Pick<
        PrismaClient['tenantInvitation'],
        'create' | 'updateMany'
    >;
    tenantMembership: Pick<
        PrismaClient['tenantMembership'],
        'findUnique' | 'upsert'
    >;
    centralIdentityEvent: Pick<PrismaClient['centralIdentityEvent'], 'create'>;
}

export interface TenantInvitationTenantDb {
    user: Pick<PrismaClient['user'], 'findUnique'>;
    userRole: Pick<PrismaClient['userRole'], 'findFirst'>;
}

export interface TenantInvitationDependencies {
    mainDb: TenantInvitationMainDb;
    loadTenantDb(tenantId: string): Promise<TenantInvitationTenantDb>;
    now(): Date;
    randomToken(): string;
}

export interface InvitationActor {
    userId: string;
}

export interface VerifiedCentralIdentity {
    issuer: string;
    subject: string;
    email: string;
    emailVerified: boolean;
}

export function normalizeIdentityEmail(email: string): string {
    return email.trim().toLowerCase();
}

export function digestInvitationToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
}

function defaultRandomToken(): string {
    return randomBytes(32).toString('base64url');
}

/**
 * Invitation lifecycle owned by MAIN. Raw tokens are returned exactly once and
 * never persisted. Acceptance authenticates by OIDC issuer+subject and only
 * uses verified email to prove that the authenticated person owns the invite.
 */
export class TenantInvitationService {
    constructor(private readonly dependencies: TenantInvitationDependencies) {}

    async createInvitation(input: {
        tenantId: string;
        tenantUserId: string;
        role: Role;
        recipientEmail: string;
        actor: InvitationActor;
        expiresInMs?: number;
    }): Promise<{ invitationId: string; token: string; expiresAt: Date }> {
        const tenant = await this.dependencies.mainDb.tenant.findUnique({
            where: { id: input.tenantId },
            select: { id: true, status: true },
        });
        if (!tenant) throw new NotFoundError('Tenant', input.tenantId);
        if (tenant.status !== ACTIVE)
            throw new BusinessRuleError('Tenant tidak aktif.');

        const tenantDb = await this.dependencies.loadTenantDb(input.tenantId);
        const user = await tenantDb.user.findUnique({
            where: { id: input.tenantUserId },
            select: {
                id: true,
                email: true,
                isActive: true,
                isSuperAdmin: true,
                centralAccountId: true,
                role: true,
            },
        });
        if (!user) throw new NotFoundError('User', input.tenantUserId);
        if (!user.isActive)
            throw new BusinessRuleError('Pengguna tenant tidak aktif.');
        if (user.isSuperAdmin)
            throw new BusinessRuleError(
                'Super Admin tidak dapat diundang sebagai akun tenant pusat.',
            );
        if (user.centralAccountId) {
            const membership =
                await this.dependencies.mainDb.tenantMembership.findUnique({
                    where: {
                        globalAccountId_tenantId: {
                            globalAccountId: user.centralAccountId,
                            tenantId: input.tenantId,
                        },
                    },
                });
            if (membership?.status !== 'REVOKED')
                throw new ConflictError(
                    'Pengguna sudah terhubung ke akun pusat.',
                );
            if (
                normalizeIdentityEmail(input.recipientEmail) !==
                normalizeIdentityEmail(user.email)
            ) {
                throw new ConflictError(
                    'Email undangan harus cocok dengan email pengguna tenant.',
                );
            }
        }

        const recipientEmail = normalizeIdentityEmail(input.recipientEmail);
        if (recipientEmail !== normalizeIdentityEmail(user.email)) {
            throw new ConflictError(
                'Email undangan harus cocok dengan email pengguna tenant.',
            );
        }

        const hasRole =
            user.role === input.role ||
            !!(await tenantDb.userRole.findFirst({
                where: { userId: user.id, role: input.role },
                select: { id: true },
            }));
        if (!hasRole)
            throw new BusinessRuleError(
                'Role undangan harus sudah dimiliki pengguna tenant.',
            );

        const existing =
            await this.dependencies.mainDb.tenantInvitation.findFirst({
                where: {
                    tenantId: input.tenantId,
                    tenantUserId: input.tenantUserId,
                    status: PENDING,
                    expiresAt: { gt: this.dependencies.now() },
                },
                select: { id: true },
            });
        if (existing)
            throw new ConflictError(
                'Masih ada undangan aktif untuk pengguna tenant ini.',
            );

        const token = this.dependencies.randomToken();
        if (token.length < 32)
            throw new BusinessRuleError('Token undangan tidak cukup kuat.');
        const now = this.dependencies.now();
        const expiresAt = new Date(
            now.getTime() + (input.expiresInMs ?? INVITATION_TTL_MS),
        );
        if (expiresAt <= now)
            throw new BusinessRuleError('Masa berlaku undangan tidak valid.');

        const invitation = await this.dependencies.mainDb.$transaction(
            async (tx) => {
                // The database enforces one PENDING invitation per tenant actor.
                // Retire stale rows in the same transaction before inserting a
                // replacement, otherwise the partial unique index rejects it.
                await tx.tenantInvitation.updateMany({
                    where: {
                        tenantId: input.tenantId,
                        tenantUserId: input.tenantUserId,
                        status: PENDING,
                        expiresAt: { lte: now },
                    },
                    data: { status: 'EXPIRED' },
                });
                const created = await tx.tenantInvitation.create({
                    data: {
                        tenantId: input.tenantId,
                        tenantUserId: input.tenantUserId,
                        recipientEmailNormalized: recipientEmail,
                        role: input.role,
                        tokenDigest: digestInvitationToken(token),
                        expiresAt,
                        createdByUserId: input.actor.userId,
                    },
                    select: { id: true, expiresAt: true },
                });
                await tx.centralIdentityEvent.create({
                    data: {
                        action: 'TENANT_INVITATION_CREATED',
                        tenantId: input.tenantId,
                        tenantUserId: input.tenantUserId,
                        invitationId: created.id,
                        actorType: 'TENANT_USER',
                        actorId: input.actor.userId,
                        details: { role: input.role },
                    },
                });
                return created;
            },
        );

        return { invitationId: invitation.id, token, expiresAt };
    }

    async revokePendingInvitation(input: {
        tenantId: string;
        tenantUserId: string;
        actor: InvitationActor;
    }): Promise<{ invitationId: string; revoked: boolean }> {
        const invitation =
            await this.dependencies.mainDb.tenantInvitation.findFirst({
                where: {
                    tenantId: input.tenantId,
                    tenantUserId: input.tenantUserId,
                    status: PENDING,
                },
                orderBy: { createdAt: 'desc' },
                select: { id: true },
            });
        if (!invitation) {
            throw new NotFoundError('TenantInvitation');
        }

        return this.dependencies.mainDb.$transaction(async (tx) => {
            const revoked = await tx.tenantInvitation.updateMany({
                where: { id: invitation.id, status: PENDING },
                data: { status: 'REVOKED' },
            });
            if (revoked.count !== 1) {
                return { invitationId: invitation.id, revoked: false };
            }
            await tx.centralIdentityEvent.create({
                data: {
                    action: 'TENANT_INVITATION_REVOKED',
                    tenantId: input.tenantId,
                    tenantUserId: input.tenantUserId,
                    invitationId: invitation.id,
                    actorType: 'TENANT_USER',
                    actorId: input.actor.userId,
                },
            });
            return { invitationId: invitation.id, revoked: true };
        });
    }

    async acceptInvitation(input: {
        token: string;
        expectedTenantId: string;
        identity: VerifiedCentralIdentity;
    }): Promise<{
        invitationId: string;
        globalAccountId: string;
        tenantId: string;
        tenantUserId: string;
        membershipId: string;
    }> {
        if (!input.identity.emailVerified)
            throw new BusinessRuleError(
                'Email akun pusat harus sudah terverifikasi.',
            );
        const token = input.token.trim();
        if (token.length < 32)
            throw new BusinessRuleError('Undangan tidak valid.');

        const invitation =
            await this.dependencies.mainDb.tenantInvitation.findUnique({
                where: { tokenDigest: digestInvitationToken(token) },
                include: { tenant: { select: { status: true } } },
            });
        if (!invitation)
            throw new BusinessRuleError(
                'Undangan tidak valid atau sudah berakhir.',
            );
        if (invitation.tenantId !== input.expectedTenantId)
            throw new BusinessRuleError(
                'Undangan tidak berlaku untuk perusahaan ini.',
            );
        if (!['PENDING', 'ACCEPTED'].includes(invitation.status))
            throw new ConflictError('Undangan sudah tidak dapat digunakan.');
        if (
            invitation.status === PENDING &&
            invitation.expiresAt <= this.dependencies.now()
        ) {
            await this.expireInvitation(invitation.id);
            throw new BusinessRuleError('Undangan sudah berakhir.');
        }
        if (invitation.tenant.status !== ACTIVE)
            throw new BusinessRuleError('Tenant tidak aktif.');
        if (
            normalizeIdentityEmail(input.identity.email) !==
            invitation.recipientEmailNormalized
        ) {
            throw new BusinessRuleError(
                'Akun pusat tidak sesuai dengan penerima undangan.',
            );
        }

        const accepted = await this.dependencies.mainDb.$transaction(
            async (tx) => {
                const account = await tx.globalAccount.upsert({
                    where: {
                        issuer_subject: {
                            issuer: input.identity.issuer,
                            subject: input.identity.subject,
                        },
                    },
                    create: {
                        issuer: input.identity.issuer,
                        subject: input.identity.subject,
                        email: invitation.recipientEmailNormalized,
                        emailVerified: true,
                    },
                    update: {
                        email: invitation.recipientEmailNormalized,
                        emailVerified: true,
                    },
                });
                if (account.status !== ACTIVE)
                    throw new BusinessRuleError('Akun pusat tidak aktif.');

                const existingMembership = await tx.tenantMembership.findUnique(
                    {
                        where: {
                            globalAccountId_tenantId: {
                                globalAccountId: account.id,
                                tenantId: invitation.tenantId,
                            },
                        },
                    },
                );
                if (
                    existingMembership &&
                    existingMembership.tenantUserId !== invitation.tenantUserId
                ) {
                    throw new ConflictError(
                        'Akun pusat sudah terhubung ke pengguna lain di tenant ini.',
                    );
                }
                if (
                    existingMembership?.status === 'REVOKED' &&
                    invitation.status !== PENDING
                )
                    throw new BusinessRuleError(
                        'Membership yang telah dicabut tidak dapat dipulihkan melalui undangan lama.',
                    );

                // A previous attempt may have committed MAIN acceptance before
                // tenant activation failed. Permit only the same verified
                // issuer+subject to resume that PENDING membership.
                if (invitation.status === 'ACCEPTED') {
                    if (
                        invitation.acceptedByAccountId !== account.id ||
                        !existingMembership ||
                        existingMembership.status !== PENDING
                    ) {
                        throw new ConflictError(
                            'Undangan sudah tidak dapat digunakan.',
                        );
                    }
                    return { membership: existingMembership, account };
                }

                const claimed = await tx.tenantInvitation.updateMany({
                    where: {
                        id: invitation.id,
                        status: PENDING,
                        expiresAt: { gt: this.dependencies.now() },
                        acceptedByAccountId: null,
                    },
                    data: {
                        status: 'ACCEPTED',
                        acceptedByAccountId: account.id,
                        acceptedAt: this.dependencies.now(),
                    },
                });
                if (claimed.count !== 1)
                    throw new ConflictError(
                        'Undangan sudah dipakai atau sudah berakhir.',
                    );

                const membership = await tx.tenantMembership.upsert({
                    where: {
                        globalAccountId_tenantId: {
                            globalAccountId: account.id,
                            tenantId: invitation.tenantId,
                        },
                    },
                    create: {
                        globalAccountId: account.id,
                        tenantId: invitation.tenantId,
                        tenantUserId: invitation.tenantUserId,
                        status: PENDING,
                    },
                    update:
                        existingMembership?.status === 'REVOKED'
                            ? {
                                  status: PENDING,
                                  activatedAt: null,
                                  revokedAt: null,
                                  membershipVersion: { increment: 1 },
                              }
                            : {},
                    select: { id: true },
                });
                await tx.centralIdentityEvent.create({
                    data: {
                        action: 'TENANT_INVITATION_ACCEPTED',
                        globalAccountId: account.id,
                        tenantId: invitation.tenantId,
                        tenantUserId: invitation.tenantUserId,
                        invitationId: invitation.id,
                        actorType: 'GLOBAL_ACCOUNT',
                        actorId: account.id,
                        details: { role: invitation.role },
                    },
                });
                return { membership, account };
            },
        );

        return {
            invitationId: invitation.id,
            globalAccountId: accepted.account.id,
            tenantId: invitation.tenantId,
            tenantUserId: invitation.tenantUserId,
            membershipId: accepted.membership.id,
        };
    }

    private async expireInvitation(invitationId: string): Promise<void> {
        await this.dependencies.mainDb.$transaction(async (tx) => {
            const expired = await tx.tenantInvitation.updateMany({
                where: {
                    id: invitationId,
                    status: PENDING,
                    expiresAt: { lte: this.dependencies.now() },
                },
                data: { status: 'EXPIRED' },
            });
            if (expired.count === 1) {
                await tx.centralIdentityEvent.create({
                    data: {
                        action: 'TENANT_INVITATION_EXPIRED',
                        invitationId,
                        actorType: 'SYSTEM',
                        actorId: 'system',
                    },
                });
            }
        });
    }
}

export function createTenantInvitationService(
    dependencies: Omit<TenantInvitationDependencies, 'now' | 'randomToken'> &
        Partial<Pick<TenantInvitationDependencies, 'now' | 'randomToken'>>,
): TenantInvitationService {
    return new TenantInvitationService({
        ...dependencies,
        now: dependencies.now ?? (() => new Date()),
        randomToken: dependencies.randomToken ?? defaultRandomToken,
    });
}
