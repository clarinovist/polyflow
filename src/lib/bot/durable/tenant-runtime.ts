import type { PrismaClient } from '@prisma/client';
import { actorContext } from '@/lib/core/actor-context';
import {
    entitlementContext,
    getMainPrisma,
    getTenantDb,
    tenantContext,
    tenantIdContext,
} from '@/lib/core/prisma';

export type ActiveTenantRuntime = {
    tenantId: string;
    tenantDb: PrismaClient;
    activeModules: string[];
};

/** Resolve worker authority from the main database, never from the envelope. */
export async function resolveActiveTenantRuntime(
    tenantId: string,
): Promise<ActiveTenantRuntime | null> {
    const mainDb = getMainPrisma();
    const tenant = await mainDb.tenant.findFirst({
        where: { id: tenantId, status: 'ACTIVE' },
        select: { id: true, dbUrl: true },
    });
    if (!tenant?.dbUrl) return null;

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
        tenantDb: getTenantDb(tenant.dbUrl),
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
