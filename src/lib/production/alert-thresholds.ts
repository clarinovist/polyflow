import { z } from 'zod';

/**
 * Tenant-owned production alert thresholds, stored as one JSON blob in
 * AppSetting under `production.alertThresholds`. All functions are pure —
 * safe to call from server actions, server pages, and client components.
 *
 * Defaults preserve pre-settings behavior so a missing/malformed setting
 * never changes how alerts render.
 */

export const PRODUCTION_ALERT_THRESHOLDS_KEY = 'production.alertThresholds';

export interface ProductionAlertThresholds {
    /** Scrap rate % above which the metric is flagged as warning (was 2). */
    scrapWarningPercent: number;
    /** Scrap rate % above which the entry is flagged as anomaly (was 5). */
    scrapAnomalyPercent: number;
    /** Absolute scrap quantity above which today's scrap is critical (was 50). */
    scrapCriticalQuantity: number;
    /** Downtime minutes above which downtime is critical (was 30). */
    downtimeCriticalMinutes: number;
    /** Units/hour below which a machine is considered slow (was 50). */
    lowThroughputPerHour: number;
}

export const DEFAULT_PRODUCTION_ALERT_THRESHOLDS: Readonly<ProductionAlertThresholds> =
    Object.freeze({
        scrapWarningPercent: 2,
        scrapAnomalyPercent: 5,
        scrapCriticalQuantity: 50,
        downtimeCriticalMinutes: 30,
        lowThroughputPerHour: 50,
    });

const percentage = z.number().int().min(0).max(100);
const positive = z.number().int().min(1).max(1_000_000_000);

/** Complete write payload — all five fields required, strict on unknown keys. */
export const productionAlertThresholdsSchema = z
    .object({
        scrapWarningPercent: percentage,
        scrapAnomalyPercent: percentage,
        scrapCriticalQuantity: positive,
        downtimeCriticalMinutes: positive,
        lowThroughputPerHour: positive,
    })
    .strict();

export type ProductionAlertThresholdsInput = z.infer<
    typeof productionAlertThresholdsSchema
>;

/**
 * Return a fresh copy merged over the shared defaults. Never return the
 * frozen default object itself so callers cannot mutate it.
 */
export function resolveProductionAlertThresholds(
    partial?: Partial<ProductionAlertThresholds> | null,
): ProductionAlertThresholds {
    return { ...DEFAULT_PRODUCTION_ALERT_THRESHOLDS, ...(partial ?? {}) };
}

/**
 * Parse a raw AppSetting JSON value at the read boundary. Never throws —
 * malformed, non-object, or out-of-range values fall back to defaults.
 * Valid partial overrides merge over the defaults.
 */
export function parseProductionAlertThresholds(
    raw: string | null | undefined,
): ProductionAlertThresholds {
    if (!raw) return resolveProductionAlertThresholds();
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return resolveProductionAlertThresholds();
        }
        const result = productionAlertThresholdsSchema
            .partial()
            .safeParse(parsed);
        if (!result.success) return resolveProductionAlertThresholds();
        return resolveProductionAlertThresholds(result.data);
    } catch {
        return resolveProductionAlertThresholds();
    }
}

export function isScrapWarning(
    thresholds: ProductionAlertThresholds,
    scrapRate: number,
): boolean {
    return scrapRate > thresholds.scrapWarningPercent;
}

export function isScrapAnomaly(
    thresholds: ProductionAlertThresholds,
    scrapRate: number,
): boolean {
    return scrapRate > thresholds.scrapAnomalyPercent;
}

export function isScrapQuantityCritical(
    thresholds: ProductionAlertThresholds,
    scrapQuantity: number,
): boolean {
    return scrapQuantity > thresholds.scrapCriticalQuantity;
}

export function isDowntimeCritical(
    thresholds: ProductionAlertThresholds,
    downtimeMinutes: number,
): boolean {
    return downtimeMinutes > thresholds.downtimeCriticalMinutes;
}

export function isLowThroughput(
    thresholds: ProductionAlertThresholds,
    unitsPerHour: number,
): boolean {
    return unitsPerHour < thresholds.lowThroughputPerHour;
}
