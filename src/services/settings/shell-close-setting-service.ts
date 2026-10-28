import { prisma } from '@/lib/core/prisma';

/**
 * How "Selesai SPK" ends a kiosk shell nobody stopped. Tenant-owned choice in
 * AppSetting because it decides the labour hours that reach cost reports.
 * - true: end at the last output on the same machine.
 * - false (default): zero-length session, so no unrecorded labour is invented.
 */
export const SHELL_CLOSE_SETTING_KEY = 'production.autoCloseShellAtLastOutput';

/** Never throws; anything but an explicit `true` keeps the zero-length default. */
export function isShellCloseAtLastOutput(
    raw: string | null | undefined,
): boolean {
    return raw === 'true';
}

export async function readShellCloseAtLastOutput(
    db: typeof prisma = prisma,
): Promise<boolean> {
    const row = await db.appSetting.findUnique({
        where: { key: SHELL_CLOSE_SETTING_KEY },
        select: { value: true },
    });
    return isShellCloseAtLastOutput(row?.value);
}

export async function saveShellCloseAtLastOutput(
    enabled: boolean,
    updatedBy: string,
    db: typeof prisma = prisma,
): Promise<boolean> {
    const value = String(enabled);
    await db.appSetting.upsert({
        where: { key: SHELL_CLOSE_SETTING_KEY },
        create: { key: SHELL_CLOSE_SETTING_KEY, value, updatedBy },
        update: { value, updatedBy },
    });
    return enabled;
}
