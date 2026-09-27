import type {
    GlobalAccount,
    Prisma,
    PrismaClient,
    TenantMembership,
} from '@prisma/client';
import {
    AuthorizationError,
    BusinessRuleError,
    ConflictError,
    NotFoundError,
} from '@/lib/errors/errors';

const ACTIVE = 'ACTIVE' as const;
const CENTRAL = 'CENTRAL' as const;

export interface CentralIdentityMainTx {
    tenantMembership: Pick<PrismaClient['tenantMembership'], 'update'>;
    centralIdentityEvent: Pick<PrismaClient['centralIdentityEvent'], 'create'>;
}

export interface CentralIdentityMainDb {
    globalAccount: Pick<PrismaClient['globalAccount'], 'findUnique' | 'update'>;
    tenantMembership: Pick<PrismaClient['tenantMembership'], 'findUnique'>;
    $transaction<T>(operation: (tx: unknown) => Promise<T>): Promise<T>;
}

export interface CentralIdentityTenantTx {
    user: Pick<PrismaClient['user'], 'findUnique' | 'update' | 'updateMany'>;
}

export interface CentralIdentityTenantDb extends CentralIdentityTenantTx {
    $transaction<T>(operation: (tx: unknown) => Promise<T>): Promise<T>;
}

export interface CentralSessionBinding {
    globalAccountId: string;
    membershipId: string;
    tenantId: string;
    tenantUserId: string;
    globalRevocationVersion: number;
    membershipVersion: number;
    localAuthVersion: number;
}

export interface CentralIdentityDependencies {
    mainDb: CentralIdentityMainDb;
    loadTenantDb(tenantId: string): Promise<CentralIdentityTenantDb>;
}

export type CentralIdentityFailure =
    | 'ACCOUNT_NOT_FOUND'
    | 'ACCOUNT_INACTIVE'
    | 'MEMBERSHIP_NOT_FOUND'
    | 'MEMBERSHIP_INACTIVE'
    | 'TENANT_INACTIVE'
    | 'TENANT_BINDING_MISMATCH'
    | 'LOCAL_USER_INACTIVE'
    | 'SESSION_REVOKED';

export class CentralIdentityAccessError extends AuthorizationError {
    constructor(readonly reason: CentralIdentityFailure) {
        super('Akses akun pusat tidak berlaku untuk perusahaan ini.');
    }
}

interface AccountWithMemberships extends GlobalAccount {
    memberships: Array<
        TenantMembership & {
            tenant: {
                id: string;
                name: string;
                subdomain: string;
                status: string;
            };
        }
    >;
}

function assertActiveAccount(
    account: GlobalAccount | null,
): asserts account is GlobalAccount {
    if (!account) throw new CentralIdentityAccessError('ACCOUNT_NOT_FOUND');
    if (account.status !== ACTIVE)
        throw new CentralIdentityAccessError('ACCOUNT_INACTIVE');
}

/**
 * MAIN/control-DB service for central identity binding. It never infers access
 * from an email address: issuer + subject identifies the account and an ACTIVE
 * TenantMembership grants access to exactly one tenant-local User actor.
 */
export class CentralIdentityService {
    constructor(private readonly dependencies: CentralIdentityDependencies) {}

    async listActiveWorkspaces(globalAccountId: string) {
        const account =
            (await this.dependencies.mainDb.globalAccount.findUnique({
                where: { id: globalAccountId },
                include: {
                    memberships: {
                        where: { status: ACTIVE },
                        include: {
                            tenant: {
                                select: {
                                    id: true,
                                    name: true,
                                    subdomain: true,
                                    status: true,
                                },
                            },
                        },
                        orderBy: { createdAt: 'asc' },
                    },
                },
            } as Prisma.GlobalAccountFindUniqueArgs)) as AccountWithMemberships | null;

        assertActiveAccount(account);

        return account.memberships
            .filter((membership) => membership.tenant.status === ACTIVE)
            .map((membership) => ({
                membershipId: membership.id,
                tenantId: membership.tenantId,
                tenantUserId: membership.tenantUserId,
                name: membership.tenant.name,
                subdomain: membership.tenant.subdomain,
            }));
    }

    async resolveActiveBinding(input: {
        issuer: string;
        subject: string;
        tenantId: string;
    }): Promise<CentralSessionBinding> {
        const account = await this.dependencies.mainDb.globalAccount.findUnique(
            {
                where: {
                    issuer_subject: {
                        issuer: input.issuer,
                        subject: input.subject,
                    },
                },
            },
        );
        assertActiveAccount(account);

        const membership =
            await this.dependencies.mainDb.tenantMembership.findUnique({
                where: {
                    globalAccountId_tenantId: {
                        globalAccountId: account.id,
                        tenantId: input.tenantId,
                    },
                },
                include: { tenant: { select: { status: true } } },
            });
        if (!membership)
            throw new CentralIdentityAccessError('MEMBERSHIP_NOT_FOUND');
        if (membership.status !== ACTIVE)
            throw new CentralIdentityAccessError('MEMBERSHIP_INACTIVE');
        if (membership.tenant.status !== ACTIVE)
            throw new CentralIdentityAccessError('TENANT_INACTIVE');

        const tenantDb = await this.dependencies.loadTenantDb(input.tenantId);
        const user = await tenantDb.user.findUnique({
            where: { id: membership.tenantUserId },
            select: {
                id: true,
                isActive: true,
                authMode: true,
                centralAccountId: true,
                centralAuthVersion: true,
            },
        });
        if (!user?.isActive)
            throw new CentralIdentityAccessError('LOCAL_USER_INACTIVE');
        if (user.authMode !== CENTRAL || user.centralAccountId !== account.id) {
            throw new CentralIdentityAccessError('TENANT_BINDING_MISMATCH');
        }

        return {
            globalAccountId: account.id,
            membershipId: membership.id,
            tenantId: membership.tenantId,
            tenantUserId: membership.tenantUserId,
            globalRevocationVersion: account.revocationVersion,
            membershipVersion: membership.membershipVersion,
            localAuthVersion: user.centralAuthVersion,
        };
    }

    async validateSessionBinding(
        binding: CentralSessionBinding,
    ): Promise<void> {
        const account = await this.dependencies.mainDb.globalAccount.findUnique(
            {
                where: { id: binding.globalAccountId },
                select: { status: true, revocationVersion: true },
            },
        );
        if (!account || account.status !== ACTIVE)
            throw new CentralIdentityAccessError('ACCOUNT_INACTIVE');

        const membership =
            await this.dependencies.mainDb.tenantMembership.findUnique({
                where: { id: binding.membershipId },
                include: { tenant: { select: { status: true } } },
            });
        if (
            !membership ||
            membership.globalAccountId !== binding.globalAccountId ||
            membership.tenantId !== binding.tenantId ||
            membership.tenantUserId !== binding.tenantUserId
        ) {
            throw new CentralIdentityAccessError('TENANT_BINDING_MISMATCH');
        }
        if (membership.status !== ACTIVE)
            throw new CentralIdentityAccessError('MEMBERSHIP_INACTIVE');
        if (membership.tenant.status !== ACTIVE)
            throw new CentralIdentityAccessError('TENANT_INACTIVE');
        if (
            account.revocationVersion !== binding.globalRevocationVersion ||
            membership.membershipVersion !== binding.membershipVersion
        ) {
            throw new CentralIdentityAccessError('SESSION_REVOKED');
        }

        const tenantDb = await this.dependencies.loadTenantDb(binding.tenantId);
        const user = await tenantDb.user.findUnique({
            where: { id: binding.tenantUserId },
            select: {
                isActive: true,
                authMode: true,
                centralAccountId: true,
                centralAuthVersion: true,
            },
        });
        if (!user?.isActive)
            throw new CentralIdentityAccessError('LOCAL_USER_INACTIVE');
        if (
            user.authMode !== CENTRAL ||
            user.centralAccountId !== binding.globalAccountId
        ) {
            throw new CentralIdentityAccessError('TENANT_BINDING_MISMATCH');
        }
        if (user.centralAuthVersion !== binding.localAuthVersion)
            throw new CentralIdentityAccessError('SESSION_REVOKED');
    }

    async revokeMembership(input: {
        globalAccountId: string;
        tenantId: string;
    }): Promise<{ membershipId: string; revoked: boolean }> {
        const membership =
            await this.dependencies.mainDb.tenantMembership.findUnique({
                where: {
                    globalAccountId_tenantId: {
                        globalAccountId: input.globalAccountId,
                        tenantId: input.tenantId,
                    },
                },
            });
        if (!membership) throw new NotFoundError('TenantMembership');
        if (membership.status === 'REVOKED') {
            return { membershipId: membership.id, revoked: false };
        }

        const revoked = await this.dependencies.mainDb.$transaction(
            async (rawTx) => {
                const tx = rawTx as CentralIdentityMainTx;
                const updated = await tx.tenantMembership.update({
                    where: {
                        id: membership.id,
                        membershipVersion: membership.membershipVersion,
                        status: { in: ['PENDING', 'ACTIVE'] },
                    },
                    data: {
                        status: 'REVOKED',
                        revokedAt: new Date(),
                        membershipVersion: { increment: 1 },
                    },
                });
                await tx.centralIdentityEvent.create({
                    data: {
                        action: 'TENANT_MEMBERSHIP_REVOKED',
                        globalAccountId: input.globalAccountId,
                        tenantId: input.tenantId,
                        tenantUserId: membership.tenantUserId,
                        actorType: 'SYSTEM',
                        actorId: 'system',
                    },
                });
                return updated;
            },
        );

        // MAIN is authoritative for access, so revocation is already effective.
        // Best-effort local invalidation must not turn an already committed
        // revocation into a misleading failure response.
        try {
            const tenantDb = await this.dependencies.loadTenantDb(
                input.tenantId,
            );
            await tenantDb.user.updateMany({
                where: {
                    id: membership.tenantUserId,
                    authMode: CENTRAL,
                    centralAccountId: input.globalAccountId,
                },
                data: {
                    tokenVersion: { increment: 1 },
                    centralAuthVersion: { increment: 1 },
                },
            });
        } catch {
            // Every protected CENTRAL request still checks MAIN membership.
        }

        return { membershipId: revoked.id, revoked: true };
    }

    async activateExistingUser(input: {
        globalAccountId: string;
        tenantId: string;
        tenantUserId: string;
    }): Promise<CentralSessionBinding> {
        const account = await this.dependencies.mainDb.globalAccount.findUnique(
            {
                where: { id: input.globalAccountId },
            },
        );
        assertActiveAccount(account);

        const membership =
            await this.dependencies.mainDb.tenantMembership.findUnique({
                where: {
                    globalAccountId_tenantId: {
                        globalAccountId: input.globalAccountId,
                        tenantId: input.tenantId,
                    },
                },
                include: { tenant: { select: { status: true } } },
            });
        if (!membership) throw new NotFoundError('TenantMembership');
        if (membership.tenant.status !== ACTIVE)
            throw new BusinessRuleError('Tenant tidak aktif.');
        if (membership.tenantUserId !== input.tenantUserId)
            throw new ConflictError(
                'Keanggotaan menunjuk pengguna tenant lain.',
            );
        if (membership.status === 'REVOKED')
            throw new BusinessRuleError(
                'Keanggotaan yang dicabut tidak dapat diaktifkan ulang.',
            );
        const tenantDb = await this.dependencies.loadTenantDb(input.tenantId);
        const user = await tenantDb.user.findUnique({
            where: { id: input.tenantUserId },
            select: {
                id: true,
                isActive: true,
                authMode: true,
                centralAccountId: true,
                centralAuthVersion: true,
            },
        });
        if (!user) throw new NotFoundError('User', input.tenantUserId);
        if (!user.isActive)
            throw new BusinessRuleError('Pengguna tenant tidak aktif.');
        if (
            user.centralAccountId &&
            user.centralAccountId !== input.globalAccountId
        ) {
            throw new ConflictError(
                'Pengguna tenant sudah terhubung ke akun pusat lain.',
            );
        }
        if (membership.status === ACTIVE) {
            if (
                user.authMode === CENTRAL &&
                user.centralAccountId === input.globalAccountId
            ) {
                return this.resolveActiveBinding({
                    issuer: account.issuer,
                    subject: account.subject,
                    tenantId: input.tenantId,
                });
            }
            throw new ConflictError('Keanggotaan sudah aktif.');
        }

        const linkedUser = await tenantDb.$transaction(async (rawTx) => {
            const tx = rawTx as CentralIdentityTenantTx;
            const freshUser = await tx.user.findUnique({
                where: { id: input.tenantUserId },
                select: {
                    isActive: true,
                    centralAccountId: true,
                    centralAuthVersion: true,
                },
            });
            if (!freshUser?.isActive)
                throw new BusinessRuleError('Pengguna tenant tidak aktif.');
            if (
                freshUser.centralAccountId &&
                freshUser.centralAccountId !== input.globalAccountId
            ) {
                throw new ConflictError(
                    'Pengguna tenant sudah terhubung ke akun pusat lain.',
                );
            }

            return tx.user.update({
                where: {
                    id: input.tenantUserId,
                    centralAuthVersion: freshUser.centralAuthVersion,
                    OR: [
                        { centralAccountId: null },
                        { centralAccountId: input.globalAccountId },
                    ],
                },
                data: {
                    authMode: CENTRAL,
                    centralAccountId: input.globalAccountId,
                    tokenVersion: { increment: 1 },
                    centralAuthVersion: { increment: 1 },
                },
                select: { centralAuthVersion: true },
            });
        });

        try {
            const activated = await this.dependencies.mainDb.$transaction(
                async (rawTx) => {
                    const tx = rawTx as CentralIdentityMainTx;
                    const updated = await tx.tenantMembership.update({
                        where: {
                            id: membership.id,
                            status: 'PENDING',
                            membershipVersion: membership.membershipVersion,
                            globalAccountId: account.id,
                            tenantId: input.tenantId,
                            tenantUserId: input.tenantUserId,
                        },
                        data: {
                            status: ACTIVE,
                            activatedAt: new Date(),
                            membershipVersion: { increment: 1 },
                        },
                    });
                    await tx.centralIdentityEvent.create({
                        data: {
                            action: 'TENANT_MEMBERSHIP_ACTIVATED',
                            globalAccountId: account.id,
                            tenantId: input.tenantId,
                            tenantUserId: input.tenantUserId,
                            actorType: 'GLOBAL_ACCOUNT',
                            actorId: account.id,
                        },
                    });
                    return updated;
                },
            );

            return {
                globalAccountId: account.id,
                membershipId: activated.id,
                tenantId: activated.tenantId,
                tenantUserId: activated.tenantUserId,
                globalRevocationVersion: account.revocationVersion,
                membershipVersion: activated.membershipVersion,
                localAuthVersion: linkedUser.centralAuthVersion,
            };
        } catch (error) {
            // Cross-database commits cannot be atomic. Never restore LOCAL mode:
            // that would reactivate the user's legacy password. Disable the
            // partially linked actor until reviewed recovery reconciles both DBs.
            try {
                await tenantDb.user.update({
                    where: {
                        id: input.tenantUserId,
                        centralAccountId: input.globalAccountId,
                    },
                    data: {
                        isActive: false,
                        tokenVersion: { increment: 1 },
                        centralAuthVersion: { increment: 1 },
                    },
                });
            } catch {
                // Preserve the original MAIN failure for recovery tooling.
            }
            throw error;
        }
    }
}
