import type { PrismaClient } from '@prisma/client';
import { actorContext } from '@/lib/core/actor-context';
import {
    entitlementContext,
    getMainPrisma,
    getTenantDb,
    tenantContext,
    tenantIdContext,
} from '@/lib/core/prisma';
import {
    createTenantControlDatasourceResolver,
    isTenantControlDatasourceConfigured,
} from './query-datasource';

export type ActiveTenantRuntime = {
    tenantId: string;
    tenantDb: PrismaClient;
    activeModules: string[];
};

/** Resolve worker authority from the main database, never from the envelope. */
async function resolveActiveTenantRuntime(
    tenantId: string,
): Promise<ActiveTenantRuntime | null> {
    const mainDb = getMainPrisma();
    const tenant = await mainDb.tenant.findFirst({
        where: { id: tenantId, status: 'ACTIVE' },
        select: { id: true, dbUrl: true },
    });
    if (!tenant?.dbUrl) return null;

    const controlDatasource = isTenantControlDatasourceConfigured()
        ? await createTenantControlDatasourceResolver()(tenant.id)
        : tenant.dbUrl;
    // With a control map configured, a missing entry is a hard failure: the
    // worker must never silently fall back to the tenant writer connection.
    if (!controlDatasource) throw new Error('ASSISTANT_TENANT_CONTROL_MISSING');

    const now = new Date();
    const modules = await mainDb.tenantModule.findMany({
        where: {
            tenantId: tenant.id,
            status: 'ACTIVE',
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { moduleKey: true },
    });
    return {
        tenantId: tenant.id,
        tenantDb: getTenantDb(controlDatasource),
        activeModules: modules.map((item) => item.moduleKey),
    };
}

/** Rebuild every AsyncLocalStorage boundary used by tenant-aware services. */
export async function runInActiveTenant<T>(
    tenantId: string,
    userId: string,
    operation: (runtime: ActiveTenantRuntime) => Promise<T>,
): Promise<T> {
    const runtime = await resolveActiveTenantRuntime(tenantId);
    if (!runtime) throw new Error('ASSISTANT_TENANT_INACTIVE');

    return tenantContext.run(runtime.tenantDb, () =>
        tenantIdContext.run(runtime.tenantId, () =>
            entitlementContext.run(runtime.activeModules, () =>
                actorContext.run({ userId }, () => operation(runtime)),
            ),
        ),
    );
}
