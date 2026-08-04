import { prisma } from '@/lib/core/prisma';
import { ROUTING_SETTING_KEY } from '@/lib/production/routing-feature-flag';

/**
 * Read the tenant routing toggle from AppSetting, plus whether the global
 * server safety gate (ROUTING_ENABLED env var) is on. Both gates must be
 * true for routing to actually work — see routing-feature-flag.ts.
 */
export async function readRoutingFeatureSettings(
    db: typeof prisma = prisma,
): Promise<{ tenantEnabled: boolean; globalEnvEnabled: boolean }> {
    const row = await db.appSetting.findUnique({
        where: { key: ROUTING_SETTING_KEY },
        select: { value: true },
    });
    return {
        tenantEnabled: row?.value === 'true',
        globalEnvEnabled: process.env.ROUTING_ENABLED === 'true',
    };
}

/**
 * Persist the tenant routing toggle as an explicit boolean string.
 */
export async function saveRoutingFeatureSettings(
    enabled: boolean,
    updatedBy: string,
    db: typeof prisma = prisma,
): Promise<boolean> {
    const value = String(enabled);
    await db.appSetting.upsert({
        where: { key: ROUTING_SETTING_KEY },
        create: {
            key: ROUTING_SETTING_KEY,
            value,
            updatedBy,
        },
        update: { value, updatedBy },
    });
    return enabled;
}
