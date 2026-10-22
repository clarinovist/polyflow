import { describe, expect, it } from 'vitest';
import { resolveAnalyticsPeriod } from '../analytics-period';

describe('resolveAnalyticsPeriod', () => {
    it('defaults to month-to-date in WIB, not in the server timezone', () => {
        // 22 Okt 2026 18:49 WIB = 11:49 UTC
        const now = new Date('2026-10-22T11:49:06.000Z');

        const { start, end } = resolveAnalyticsPeriod(undefined, now);

        // 1 Okt 00:00 WIB .. 22 Okt 23:59:59.999 WIB
        expect(start.toISOString()).toBe('2026-09-30T17:00:00.000Z');
        expect(end.toISOString()).toBe('2026-10-22T16:59:59.999Z');
    });

    it('uses the WIB day for "now" near the UTC date boundary', () => {
        // 23 Okt 2026 02:00 WIB = 22 Okt 19:00 UTC: already the 23rd in WIB
        const now = new Date('2026-10-22T19:00:00.000Z');

        const { end } = resolveAnalyticsPeriod(undefined, now);

        expect(end.toISOString()).toBe('2026-10-23T16:59:59.999Z');
    });

    it('snaps an explicit range to whole WIB business days', () => {
        const { start, end } = resolveAnalyticsPeriod({
            from: new Date('2026-09-30T17:00:00.000Z'),
            to: new Date('2026-10-31T16:59:59.999Z'),
        });

        expect(start.toISOString()).toBe('2026-09-30T17:00:00.000Z');
        expect(end.toISOString()).toBe('2026-10-31T16:59:59.999Z');
    });

    it('keeps entries at 00:30 WIB on the first day inside the range', () => {
        const { start } = resolveAnalyticsPeriod({
            from: new Date('2026-10-01T00:00:00.000Z'),
            to: new Date('2026-10-31T00:00:00.000Z'),
        });

        // from resolves to WIB 1 Okt (07:00 WIB), so the day starts 30 Sep 17:00 UTC
        expect(start.toISOString()).toBe('2026-09-30T17:00:00.000Z');
        expect(
            new Date('2026-09-30T17:30:00.000Z').getTime(),
        ).toBeGreaterThanOrEqual(start.getTime());
    });
});
