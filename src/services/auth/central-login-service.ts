import type { PrismaClient, Role } from '@prisma/client';
import { CentralIdentityService } from '@/services/auth/central-identity-service';
import { AuthorizationError } from '@/lib/errors/errors';
import { normalizeUserRoles } from '@/lib/auth/roles';

export interface CentralLoginMainDb {
    tenant: Pick<PrismaClient['tenant'], 'findUnique'>;
    globalAccount: Pick<PrismaClient['globalAccount'], 'findUnique' | 'update'>;
    tenantMembership: Pick<PrismaClient['tenantMembership'], 'findUnique'>;
    $transaction: PrismaClient['$transaction'];
}

export interface CentralLoginTenantDb {
    user: Pick<PrismaClient['user'], 'findUnique' | 'update' | 'updateMany'>;
    userRole: Pick<PrismaClient['userRole'], 'findMany'>;
    rolePermission: Pick<PrismaClient['rolePermission'], 'findMany'>;
    $transaction: PrismaClient['$transaction'];
}

export interface VerifiedOidcIdentity {
    issuer: string;
    subject: string;
    email: string;
    emailVerified: boolean;
    name?: string | null;
    image?: string | null;
}

export interface CentralLoginDependencies {
    mainDb: CentralLoginMainDb;
    loadTenantDb(databaseUrl: string): CentralLoginTenantDb;
}

/** Resolve an OIDC identity to the explicit tenant-local actor and permissions. */
export async function resolveCentralLoginUser(
    input: {
        tenantSubdomain: string;
        identity: VerifiedOidcIdentity;
    },
    dependencies: CentralLoginDependencies,
) {
    if (!input.identity.emailVerified)
        throw new AuthorizationError('Identitas pusat belum terverifikasi.');

    const configuredIssuer = process.env.CENTRAL_OIDC_ISSUER?.replace(
        /\/+$/,
        '',
    );
    if (!configuredIssuer || input.identity.issuer !== configuredIssuer) {
        throw new AuthorizationError('Issuer identitas pusat tidak valid.');
    }

    const tenant = await dependencies.mainDb.tenant.findUnique({
        where: { subdomain: input.tenantSubdomain },
        select: { id: true, dbUrl: true, status: true },
    });
    if (!tenant?.dbUrl || tenant.status !== 'ACTIVE')
        throw new AuthorizationError('Tenant tidak tersedia.');

    const tenantDb = dependencies.loadTenantDb(tenant.dbUrl);
    const identityService = new CentralIdentityService({
        mainDb: dependencies.mainDb,
        loadTenantDb: async (tenantId) => {
            if (tenantId !== tenant.id)
                throw new AuthorizationError('Tenant callback tidak cocok.');
            return tenantDb;
        },
    });
    const binding = await identityService.resolveActiveBinding({
        issuer: input.identity.issuer,
        subject: input.identity.subject,
        tenantId: tenant.id,
    });

    const user = await tenantDb.user.findUnique({
        where: { id: binding.tenantUserId },
        select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
            isActive: true,
            isSuperAdmin: true,
            tokenVersion: true,
            authMode: true,
            centralAccountId: true,
        },
    });
    if (
        !user?.isActive ||
        user.isSuperAdmin ||
        user.authMode !== 'CENTRAL' ||
        user.centralAccountId !== binding.globalAccountId
    ) {
        throw new AuthorizationError('Binding pengguna tenant tidak valid.');
    }

    const assignedRoles = await tenantDb.userRole.findMany({
        where: { userId: user.id },
        select: { role: true },
    });
    const roles = normalizeUserRoles(
        user.role,
        assignedRoles.map((item) => item.role),
    ) as Role[];
    const permissions = await tenantDb.rolePermission.findMany({
        where: { role: { in: roles }, canAccess: true },
        select: { resource: true },
    });
    const allowedResources = roles.includes('ADMIN')
        ? ['ALL']
        : Array.from(
              new Set(permissions.map((permission) => permission.resource)),
          );

    return {
        id: user.id,
        name: user.name ?? input.identity.name ?? undefined,
        email: user.email,
        image: user.avatarUrl ?? input.identity.image ?? undefined,
        role: user.role,
        roles,
        rememberMe: true,
        isSuperAdmin: false,
        allowedResources,
        tokenVersion: user.tokenVersion,
        tenantSubdomain: input.tenantSubdomain,
        ...binding,
    };
}
