import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PRODUCTION_ALERT_THRESHOLDS,
    PRODUCTION_ALERT_THRESHOLDS_KEY,
    classifyAffalLevel,
    isDowntimeCritical,
    isLowThroughput,
    isScrapAnomaly,
    isScrapQuantityCritical,
    isScrapWarning,
    parseProductionAlertThresholds,
    productionAlertThresholdsSchema,
    resolveProductionAlertThresholds,
} from '../alert-thresholds';

describe('alert-thresholds policy module', () => {
    it('exposes the AppSetting key', () => {
        expect(PRODUCTION_ALERT_THRESHOLDS_KEY).toBe(
            'production.alertThresholds',
        );
    });

    it('defaults follow the 10% warning / 15% critical affal policy', () => {
        expect(DEFAULT_PRODUCTION_ALERT_THRESHOLDS).toEqual({
            scrapWarningPercent: 10,
            scrapAnomalyPercent: 15,
            scrapCriticalQuantity: 50,
            downtimeCriticalMinutes: 30,
            lowThroughputPerHour: 50,
        });
    });

    it('valid partial override merges with defaults', () => {
        const parsed = parseProductionAlertThresholds(
            JSON.stringify({ scrapWarningPercent: 7 }),
        );
        expect(parsed.scrapWarningPercent).toBe(7);
        expect(parsed.scrapAnomalyPercent).toBe(15);
        expect(parsed.scrapCriticalQuantity).toBe(50);
        expect(parsed.downtimeCriticalMinutes).toBe(30);
        expect(parsed.lowThroughputPerHour).toBe(50);
    });

    it('malformed JSON returns defaults', () => {
        expect(parseProductionAlertThresholds('{not-json')).toEqual(
            DEFAULT_PRODUCTION_ALERT_THRESHOLDS,
        );
    });

    it('non-object JSON returns defaults', () => {
        expect(parseProductionAlertThresholds('"kg"')).toEqual(
            DEFAULT_PRODUCTION_ALERT_THRESHOLDS,
        );
        expect(parseProductionAlertThresholds('42')).toEqual(
            DEFAULT_PRODUCTION_ALERT_THRESHOLDS,
        );
    });

    it('out-of-range values at read boundary fall back to defaults', () => {
        expect(
            parseProductionAlertThresholds(
                JSON.stringify({ scrapWarningPercent: -1 }),
            ),
        ).toEqual(DEFAULT_PRODUCTION_ALERT_THRESHOLDS);
        expect(
            parseProductionAlertThresholds(
                JSON.stringify({ scrapWarningPercent: 101 }),
            ),
        ).toEqual(DEFAULT_PRODUCTION_ALERT_THRESHOLDS);
        expect(
            parseProductionAlertThresholds(
                JSON.stringify({ downtimeCriticalMinutes: 0 }),
            ),
        ).toEqual(DEFAULT_PRODUCTION_ALERT_THRESHOLDS);
    });

    it('write schema rejects out-of-range and negative values', () => {
        expect(
            productionAlertThresholdsSchema.safeParse({
                ...DEFAULT_PRODUCTION_ALERT_THRESHOLDS,
                scrapWarningPercent: -1,
            }).success,
        ).toBe(false);
        expect(
            productionAlertThresholdsSchema.safeParse({
                ...DEFAULT_PRODUCTION_ALERT_THRESHOLDS,
                scrapWarningPercent: 101,
            }).success,
        ).toBe(false);
        expect(
            productionAlertThresholdsSchema.safeParse({
                ...DEFAULT_PRODUCTION_ALERT_THRESHOLDS,
                downtimeCriticalMinutes: 0,
            }).success,
        ).toBe(false);
    });

    it('write schema accepts the complete valid payload', () => {
        expect(
            productionAlertThresholdsSchema.safeParse({
                ...DEFAULT_PRODUCTION_ALERT_THRESHOLDS,
            }).success,
        ).toBe(true);
    });

    it('missing raw value returns defaults', () => {
        expect(parseProductionAlertThresholds(null)).toEqual(
            DEFAULT_PRODUCTION_ALERT_THRESHOLDS,
        );
        expect(parseProductionAlertThresholds(undefined)).toEqual(
            DEFAULT_PRODUCTION_ALERT_THRESHOLDS,
        );
    });

    it('returned objects are fresh copies, not the shared defaults', () => {
        const a = parseProductionAlertThresholds(
            JSON.stringify({ scrapWarningPercent: 9 }),
        );
        const b = parseProductionAlertThresholds(null);
        a.scrapWarningPercent = 999;
        expect(DEFAULT_PRODUCTION_ALERT_THRESHOLDS.scrapWarningPercent).toBe(10);
        expect(b.scrapWarningPercent).toBe(10);
        expect(
            resolveProductionAlertThresholds().scrapWarningPercent,
        ).toBe(10);
    });

    it('helper predicates classify scrap/downtime/throughput consistently', () => {
        const th = DEFAULT_PRODUCTION_ALERT_THRESHOLDS;
        expect(isScrapWarning(th, 10.1)).toBe(true);
        expect(isScrapWarning(th, 10)).toBe(false);
        expect(isScrapAnomaly(th, 15.1)).toBe(true);
        expect(isScrapAnomaly(th, 15)).toBe(false);
        expect(isScrapQuantityCritical(th, 51)).toBe(true);
        expect(isScrapQuantityCritical(th, 50)).toBe(false);
        expect(isDowntimeCritical(th, 31)).toBe(true);
        expect(isDowntimeCritical(th, 30)).toBe(false);
        expect(isLowThroughput(th, 49)).toBe(true);
        expect(isLowThroughput(th, 50)).toBe(false);
    });
});

describe('classifyAffalLevel', () => {
    const th = DEFAULT_PRODUCTION_ALERT_THRESHOLDS;

    it('returns NONE when the share cannot be computed', () => {
        expect(classifyAffalLevel(th, null)).toBe('NONE');
    });

    it('returns OK at or below the warning threshold', () => {
        expect(classifyAffalLevel(th, 0)).toBe('OK');
        expect(classifyAffalLevel(th, 4.8)).toBe('OK');
        expect(classifyAffalLevel(th, 10)).toBe('OK');
    });

    it('returns WARNING above warning and up to the critical threshold', () => {
        expect(classifyAffalLevel(th, 10.1)).toBe('WARNING');
        expect(classifyAffalLevel(th, 14.8)).toBe('WARNING');
        expect(classifyAffalLevel(th, 15)).toBe('WARNING');
    });

    it('returns CRITICAL strictly above the critical threshold', () => {
        expect(classifyAffalLevel(th, 15.1)).toBe('CRITICAL');
        expect(classifyAffalLevel(th, 17.5)).toBe('CRITICAL');
    });

    it('follows tenant overrides instead of the defaults', () => {
        const custom = {
            ...th,
            scrapWarningPercent: 2,
            scrapAnomalyPercent: 5,
        };
        expect(classifyAffalLevel(custom, 4.8)).toBe('WARNING');
        expect(classifyAffalLevel(custom, 5.1)).toBe('CRITICAL');
    });
});

