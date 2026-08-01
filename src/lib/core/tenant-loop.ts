import {
    getMainPrisma,
    getTenantDb,
    tenantContext,
    tenantIdContext,
} from '@/lib/core/prisma';
import { actorContext } from '@/lib/core/actor-context';

export async function runForEachActiveTenant<T>(
    fn: (tenant: { id: string; subdomain: string }) => Promise<T>,
): Promise<Array<{ tenant: string; result?: T; error?: string }>> {
    const main = getMainPrisma();
    const tenants = await main.tenant.findMany({
        where: { status: 'ACTIVE' },
    });
    const results: Array<{ tenant: string; result?: T; error?: string }> = [];
    for (const tenant of tenants) {
        try {
            const tenantDb = getTenantDb(tenant.dbUrl);
            const result = await tenantContext.run(tenantDb, () =>
                tenantIdContext.run(tenant.id, () =>
                    actorContext.run(
                        { userId: 'system' },
                        () => fn(tenant),
                    ),
                ),
            );
            results.push({ tenant: tenant.subdomain, result });
        } catch (err) {
            results.push({
                tenant: tenant.subdomain,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    return results;
}
