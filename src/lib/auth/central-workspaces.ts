import { getMainPrisma, getTenantDb } from '@/lib/core/prisma';
import { CentralIdentityService } from '@/services/auth/central-identity-service';
import { buildTenantOrigin } from '@/lib/auth/tenant-origin';
import { isCentralSsoConfigured } from '@/lib/auth/central-oidc-config';

export interface CentralWorkspaceOption {
    tenantId: string;
    name: string;
    subdomain: string;
    href: string;
}

export async function getCentralWorkspaceOptions(
    globalAccountId: string | undefined,
): Promise<CentralWorkspaceOption[]> {
    if (!globalAccountId || !isCentralSsoConfigured()) return [];
    const mainDb = getMainPrisma();
    const service = new CentralIdentityService({
        mainDb,
        loadTenantDb: async () => {
            throw new Error(
                'Workspace listing must not open a tenant database.',
            );
        },
    });
    const workspaces = await service.listActiveWorkspaces(globalAccountId);
    const valid = await Promise.all(
        workspaces.map(async (workspace) => {
            const tenant = await mainDb.tenant.findUnique({
                where: { id: workspace.tenantId },
                select: { dbUrl: true },
            });
            if (!tenant?.dbUrl) return null;
            const user = await getTenantDb(tenant.dbUrl).user.findUnique({
                where: { id: workspace.tenantUserId },
                select: {
                    isActive: true,
                    authMode: true,
                    centralAccountId: true,
                },
            });
            if (
                !user?.isActive ||
                user.authMode !== 'CENTRAL' ||
                user.centralAccountId !== globalAccountId
            )
                return null;
            return {
                tenantId: workspace.tenantId,
                name: workspace.name,
                subdomain: workspace.subdomain,
                href: `${buildTenantOrigin({
                    id: workspace.tenantId,
                    subdomain: workspace.subdomain,
                    status: 'ACTIVE',
                })}/login`,
            };
        }),
    );
    return valid.filter(
        (workspace): workspace is CentralWorkspaceOption => !!workspace,
    );
}
