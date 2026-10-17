import { describe, expect, it } from 'vitest';
import { compareWindows, dayKey, firstCompleteDay, jakartaDayStart, learningConfiguration, learningReviewSchema, observationSchema, observationState, warrantsInvestigation } from '../contracts';

const valid = { PRODUCT_LEARNING_ENABLED: 'true', PRODUCT_LEARNING_POLICY_VERSION: 'approved-v1', PRODUCT_LEARNING_ACTIVE_FROM: '2026-10-17T10:00:00+07:00', PRODUCT_LEARNING_RETENTION_DAYS: '90', PRODUCT_LEARNING_CLOSED_RETENTION_DAYS: '180', PRODUCT_LEARNING_SCOPE: 'restricted-global-product-reliability' };
describe('learning policy and deterministic contracts', () => {
    it('fails closed without explicit valid policy, scope, date and retention', () => {
        expect(learningConfiguration({})).toEqual({ enabled: false, reason: 'DISABLED' });
        expect(learningConfiguration({ PRODUCT_LEARNING_ENABLED: 'true' }).enabled).toBe(false);
        expect(learningConfiguration(valid).enabled).toBe(true);
        for (const field of Object.keys(valid).filter(key => key !== 'PRODUCT_LEARNING_ENABLED')) {
            expect(learningConfiguration({ ...valid, [field]: '' }).enabled).toBe(false);
        }
        expect(learningConfiguration({ ...valid, PRODUCT_LEARNING_RETENTION_DAYS: '999' }).enabled).toBe(false);
    });
    it('uses complete Jakarta days without backfill before activation', () => {
        const start = jakartaDayStart(new Date('2026-10-17T18:00:00Z'));
        expect(start.toISOString()).toBe('2026-10-17T17:00:00.000Z');
        expect(dayKey(start).toISOString()).toBe('2026-10-18T00:00:00.000Z');
        expect(firstCompleteDay(new Date('2026-10-17T10:00:00+07:00')).toISOString()).toBe('2026-10-17T17:00:00.000Z');
        expect(firstCompleteDay(start)).toEqual(start);
    });
    it('does not treat no data or low counts as healthy evidence', () => {
        const metricKey = 'help_failure_share' as const;
        expect(observationState({ metricKey, numerator: 0, denominator: 0 })).toBe('NO_DATA');
        expect(observationState({ metricKey, numerator: 5, denominator: 5 })).toBe('INSUFFICIENT');
        expect(warrantsInvestigation({ metricKey, numerator: 5, denominator: 5 })).toBe(false);
        expect(warrantsInvestigation({ metricKey, numerator: 4, denominator: 20 })).toBe(true);
        expect(warrantsInvestigation({ metricKey, numerator: 3, denominator: 20 })).toBe(false);
        expect(observationSchema.safeParse({ metricKey, numerator: 3, denominator: 2 }).success).toBe(false);
        expect(observationSchema.safeParse({ metricKey, numerator: 0, denominator: 2, userId: 'private' }).success).toBe(false);
        expect(observationSchema.safeParse({ metricKey: 'pricing', numerator: 0, denominator: 20 }).success).toBe(false);
    });
    it('requires complete comparable windows and prespecified descriptive thresholds', () => {
        const before = { metricKey: 'help_failure_share' as const, numerator: 20, denominator: 100 };
        expect(compareWindows(before, { ...before, numerator: 15 }, true)).toBe('IMPROVED_OBSERVED_METRIC');
        expect(compareWindows(before, { ...before, numerator: 25 }, true)).toBe('REGRESSED');
        expect(compareWindows(before, { ...before, numerator: 19 }, true)).toBe('UNCHANGED');
        expect(compareWindows(before, { ...before, numerator: 0 }, false)).toBe('INCONCLUSIVE');
        expect(compareWindows(before, { ...before, numerator: 0, denominator: 0 }, true)).toBe('INCONCLUSIVE');
        expect(compareWindows(before, { ...before, metricKey: 'mobile_failure_share' }, true)).toBe('INCONCLUSIVE');
    });
    it('accepts only bounded references and rejects arbitrary notes or actor impersonation', () => {
        expect(learningReviewSchema.safeParse({ id: 'a', action: 'accept' }).success).toBe(true);
        expect(learningReviewSchema.safeParse({ id: 'a', action: 'accept', actorId: 'other' }).success).toBe(false);
        expect(learningReviewSchema.safeParse({ id: 'a', action: 'intervention', releaseRef: 'a'.repeat(40), verificationRef: 'src/lib/__tests__/example.test.ts' }).success).toBe(true);
        expect(learningReviewSchema.safeParse({ id: 'a', action: 'intervention', releaseRef: 'latest', verificationRef: 'https://private.invalid' }).success).toBe(false);
    });
});
