import { prisma } from '@/lib/core/prisma';

/**
 * Where an SPK's conversion cost (labour, power, upkeep) comes from in cost
 * reports. Tenant-owned choice in AppSetting:
 * - disabled (default): labour and machine time from kiosk sessions, as before.
 * - enabled: sessions carry no cost; the POSTED journal amounts of the chosen
 *   expense accounts in the report period are split across the SPKs completed
 *   in it by material cost. Enabled with no account = no conversion cost.
 */
export const CONVERSION_COST_SETTING_KEY = 'costing.conversionCostAllocation';

export interface ConversionCostSetting {
    enabled: boolean;
    accountIds: string[];
}

const DISABLED: ConversionCostSetting = { enabled: false, accountIds: [] };
/** Same cap the settings action validates against. */
export const MAX_CONVERSION_ACCOUNTS = 50;

/** Never throws; anything malformed keeps the session-based default. */
export function parseConversionCostSetting(
    raw: string | null | undefined,
): ConversionCostSetting {
    if (!raw) return DISABLED;
    try {
        const value: unknown = JSON.parse(raw);
        if (typeof value !== 'object' || value === null) return DISABLED;
        const { enabled, accountIds } = value as Record<string, unknown>;
        if (enabled !== true) return DISABLED;
        if (!Array.isArray(accountIds)) return DISABLED;
        const ids = accountIds.filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
        );
        if (ids.length !== accountIds.length || ids.length > MAX_CONVERSION_ACCOUNTS)
            return DISABLED;
        return { enabled: true, accountIds: [...new Set(ids)] };
    } catch {
        return DISABLED;
    }
}

export async function readConversionCostSetting(
    db: typeof prisma = prisma,
): Promise<ConversionCostSetting> {
    const row = await db.appSetting.findUnique({
        where: { key: CONVERSION_COST_SETTING_KEY },
        select: { value: true },
    });
    return parseConversionCostSetting(row?.value);
}

/** Callers validate the ids (existing EXPENSE accounts) before saving. */
export async function saveConversionCostSetting(
    setting: ConversionCostSetting,
    updatedBy: string,
    db: typeof prisma = prisma,
): Promise<ConversionCostSetting> {
    const normalized: ConversionCostSetting = setting.enabled
        ? { enabled: true, accountIds: [...new Set(setting.accountIds)] }
        : DISABLED;
    const value = JSON.stringify(normalized);
    await db.appSetting.upsert({
        where: { key: CONVERSION_COST_SETTING_KEY },
        create: { key: CONVERSION_COST_SETTING_KEY, value, updatedBy },
        update: { value, updatedBy },
    });
    return normalized;
}
