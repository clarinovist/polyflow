import { prisma } from '@/lib/core/prisma';
import {
    KIOSK_PROSES_KHUSUS_SETTING_KEY,
    isProsesKhususEnabled,
} from '@/lib/kiosk/tenant-features';

/**
 * Read the tenant Proses Khusus toggle from AppSetting.
 * Fails closed — missing/malformed values resolve to `false`.
 * Uses the tenant-routed Prisma proxy; safe to call inside withTenantPage context.
 */
export async function readKioskFeatureSettings(
    db: typeof prisma = prisma,
): Promise<boolean> {
    const row = await db.appSetting.findUnique({
        where: { key: KIOSK_PROSES_KHUSUS_SETTING_KEY },
        select: { value: true },
    });
    return isProsesKhususEnabled(row?.value);
}

/**
 * Persist the tenant Proses Khusus toggle as an explicit boolean string.
 */
export async function saveKioskFeatureSettings(
    enabled: boolean,
    updatedBy: string,
    db: typeof prisma = prisma,
): Promise<boolean> {
    const value = String(enabled);
    await db.appSetting.upsert({
        where: { key: KIOSK_PROSES_KHUSUS_SETTING_KEY },
        create: {
            key: KIOSK_PROSES_KHUSUS_SETTING_KEY,
            value,
            updatedBy,
        },
        update: { value, updatedBy },
    });
    return enabled;
}
