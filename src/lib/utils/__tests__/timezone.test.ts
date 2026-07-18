/**
 * Timezone utilities — unit tests
 *
 * CRITICAL: Tests force TZ=UTC to simulate Docker/server environment.
 * This ensures helpers work correctly regardless of host machine timezone.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  formatWIB,
  parseBusinessDate,
  getWibDayBounds,
  toBusinessDateString,
  businessDateToEntryDate,
  normalizeToBusinessDay,
  formatWibDate,
  wibRangeBounds,
  BUSINESS_TIMEZONE,
} from '../timezone';

// Force UTC to simulate Docker server environment
const ORIGINAL_TZ = process.env.TZ;

describe('timezone utilities', () => {
  beforeEach(() => {
    process.env.TZ = 'UTC';
  });

  afterEach(() => {
    if (ORIGINAL_TZ !== undefined) {
      process.env.TZ = ORIGINAL_TZ;
    } else {
      delete process.env.TZ;
    }
  });

  describe('formatWIB', () => {
    it('formats a UTC date to WIB correctly', () => {
      // 2026-07-01T17:00:00Z = 2 Jul 2026 00:00 WIB
      const result = formatWIB('2026-07-01T17:00:00.000Z', 'dd MMM yyyy');
      expect(result).toBe('02 Jul 2026');
    });

    it('formats a UTC date at WIB afternoon', () => {
      // 2026-07-02T10:00:00Z = 2 Jul 2026 17:00 WIB
      const result = formatWIB('2026-07-02T10:00:00.000Z', 'dd MMM yyyy');
      expect(result).toBe('02 Jul 2026');
    });

    it('returns "-" for null/undefined', () => {
      expect(formatWIB(null, 'dd MMM yyyy')).toBe('-');
      expect(formatWIB(undefined, 'dd MMM yyyy')).toBe('-');
    });

    it('returns "-" for invalid date', () => {
      expect(formatWIB('not-a-date', 'dd MMM yyyy')).toBe('-');
    });
  });

  describe('parseBusinessDate', () => {
    it('accepts valid YYYY-MM-DD', () => {
      expect(parseBusinessDate('2026-07-01')).toBe('2026-07-01');
      expect(parseBusinessDate('2025-12-31')).toBe('2025-12-31');
    });

    it('rejects invalid format', () => {
      expect(() => parseBusinessDate('07/01/2026')).toThrow('Invalid date format');
      expect(() => parseBusinessDate('2026-7-1')).toThrow('Invalid date format');
    });

    it('rejects non-existent dates', () => {
      expect(() => parseBusinessDate('2026-02-30')).toThrow('Invalid date');
      expect(() => parseBusinessDate('2026-04-31')).toThrow('Invalid date');
    });
  });

  describe('getWibDayBounds', () => {
    it('returns correct bounds for 2026-07-02 (acceptance test)', () => {
      const { startOfDay, endOfDay } = getWibDayBounds('2026-07-02');
      expect(startOfDay.toISOString()).toBe('2026-07-01T17:00:00.000Z');
      expect(endOfDay.toISOString()).toBe('2026-07-02T16:59:59.999Z');
    });

    it('returns correct bounds for 2026-07-01', () => {
      const { startOfDay, endOfDay } = getWibDayBounds('2026-07-01');
      expect(startOfDay.toISOString()).toBe('2026-06-30T17:00:00.000Z');
      expect(endOfDay.toISOString()).toBe('2026-07-01T16:59:59.999Z');
    });

    it('handles year boundary 2025-12-31', () => {
      const { startOfDay, endOfDay } = getWibDayBounds('2025-12-31');
      expect(startOfDay.toISOString()).toBe('2025-12-30T17:00:00.000Z');
      expect(endOfDay.toISOString()).toBe('2025-12-31T16:59:59.999Z');
    });

    it('handles year boundary 2026-01-01', () => {
      const { startOfDay, endOfDay } = getWibDayBounds('2026-01-01');
      expect(startOfDay.toISOString()).toBe('2025-12-31T17:00:00.000Z');
      expect(endOfDay.toISOString()).toBe('2026-01-01T16:59:59.999Z');
    });

    it('2026-07-02 bounds include 2026-07-01T17:00:00.000Z (the critical bug case)', () => {
      const { startOfDay, endOfDay } = getWibDayBounds('2026-07-02');
      const entryDate = new Date('2026-07-01T17:00:00.000Z');
      expect(entryDate >= startOfDay).toBe(true);
      expect(entryDate <= endOfDay).toBe(true);
    });

    it('2026-07-01 bounds EXCLUDE 2026-07-01T17:00:00.000Z (belongs to Jul 2)', () => {
      const { startOfDay, endOfDay } = getWibDayBounds('2026-07-01');
      const entryDate = new Date('2026-07-01T17:00:00.000Z');
      // 17:00 UTC = Jul 2 00:00 WIB — should NOT be in Jul 1 bounds
      expect(entryDate < startOfDay || entryDate > endOfDay).toBe(true);
    });

    it('2026-07-01 bounds EXCLUDE 2026-07-02T16:59:59.999Z', () => {
      const { endOfDay } = getWibDayBounds('2026-07-01');
      const edge = new Date('2026-07-02T16:59:59.999Z');
      expect(edge > endOfDay).toBe(true);
    });

    it('2026-07-01 bounds INCLUDE 2026-07-01T16:59:59.999Z (last WIB second of Jul 1)', () => {
      const { startOfDay, endOfDay } = getWibDayBounds('2026-07-01');
      const edge = new Date('2026-07-01T16:59:59.999Z');
      expect(edge >= startOfDay).toBe(true);
      expect(edge <= endOfDay).toBe(true);
    });

    it('rejects invalid date strings', () => {
      expect(() => getWibDayBounds('not-a-date')).toThrow();
      expect(() => getWibDayBounds('2026-13-01')).toThrow();
    });
  });

  describe('toBusinessDateString', () => {
    it('extracts YYYY-MM-DD in WIB from a UTC Date', () => {
      // Jul 2 00:00 WIB = Jul 1 17:00 UTC
      const d = new Date('2026-07-01T17:00:00.000Z');
      expect(toBusinessDateString(d)).toBe('2026-07-02');
    });

    it('extracts YYYY-MM-DD in WIB from a UTC afternoon Date (same WIB day)', () => {
      // Jul 2 17:00 WIB = Jul 2 10:00 UTC
      const d = new Date('2026-07-02T10:00:00.000Z');
      expect(toBusinessDateString(d)).toBe('2026-07-02');
    });

    it('handles WIB midnight edge: Jul 1 16:59:59.999Z = Jul 1 23:59:59.999 WIB', () => {
      const d = new Date('2026-07-01T16:59:59.999Z');
      expect(toBusinessDateString(d)).toBe('2026-07-01');
    });

    it('handles ISO string input', () => {
      expect(toBusinessDateString('2026-07-01T17:00:00.000Z')).toBe('2026-07-02');
    });
  });

  describe('businessDateToEntryDate', () => {
    it('converts date string to WIB midnight as UTC instant', () => {
      const result = businessDateToEntryDate('2026-07-02');
      expect(result.toISOString()).toBe('2026-07-01T17:00:00.000Z');
    });

    it('result falls within getWibDayBounds for same date', () => {
      const dateStr = '2026-07-02';
      const entryDate = businessDateToEntryDate(dateStr);
      const { startOfDay, endOfDay } = getWibDayBounds(dateStr);
      expect(entryDate >= startOfDay).toBe(true);
      expect(entryDate <= endOfDay).toBe(true);
    });

    it('year boundary works', () => {
      const result = businessDateToEntryDate('2026-01-01');
      expect(result.toISOString()).toBe('2025-12-31T17:00:00.000Z');
    });
  });

  describe('normalizeToBusinessDay (write-path)', () => {
    it('anchors a WIB-midnight picker Date to the same WIB business day', () => {
      // Date picker in a WIB browser produces Jul 2 00:00 WIB = Jul 1 17:00 UTC
      const picker = new Date('2026-07-01T17:00:00.000Z');
      const result = normalizeToBusinessDay(picker);
      expect(result.toISOString()).toBe('2026-07-01T17:00:00.000Z');
      expect(toBusinessDateString(result)).toBe('2026-07-02');
    });

    it('Feby case: a Jul 2 picker never lands on Jul 1 bounds on a UTC server', () => {
      // The bug: server stored the raw Date; a Jul 2 entry leaked into Jul 1 reports.
      const picker = new Date('2026-07-02T00:00:00+07:00'); // 2 Jul WIB
      const stored = normalizeToBusinessDay(picker);

      const jul1 = getWibDayBounds('2026-07-01');
      const jul2 = getWibDayBounds('2026-07-02');

      // Must NOT be in Jul 1
      expect(stored < jul1.startOfDay || stored > jul1.endOfDay).toBe(true);
      // Must be in Jul 2
      expect(stored >= jul2.startOfDay).toBe(true);
      expect(stored <= jul2.endOfDay).toBe(true);
    });

    it('normalizes a server-local (UTC) midnight Date to the correct WIB day', () => {
      // A naive `new Date('2026-07-02')` on a UTC server = Jul 2 00:00 UTC = Jul 2 07:00 WIB
      const naive = new Date('2026-07-02T00:00:00.000Z');
      const stored = normalizeToBusinessDay(naive);
      // Jul 2 07:00 WIB is still Jul 2 → anchored to Jul 2 00:00 WIB
      expect(stored.toISOString()).toBe('2026-07-01T17:00:00.000Z');
      expect(toBusinessDateString(stored)).toBe('2026-07-02');
    });

    it('accepts an ISO string input', () => {
      expect(normalizeToBusinessDay('2026-07-01T17:00:00.000Z').toISOString()).toBe(
        '2026-07-01T17:00:00.000Z',
      );
    });

    it('is idempotent', () => {
      const once = normalizeToBusinessDay(new Date('2026-07-02T10:00:00.000Z'));
      const twice = normalizeToBusinessDay(once);
      expect(twice.toISOString()).toBe(once.toISOString());
    });

    it('handles year boundary', () => {
      const picker = new Date('2026-01-01T00:00:00+07:00');
      const stored = normalizeToBusinessDay(picker);
      expect(stored.toISOString()).toBe('2025-12-31T17:00:00.000Z');
      expect(toBusinessDateString(stored)).toBe('2026-01-01');
    });
  });

  describe('wibRangeBounds (report filters)', () => {
    it('snaps a range to WIB start-of-day .. end-of-day', () => {
      const start = new Date('2026-06-01T00:00:00+07:00'); // 1 Jun WIB
      const end = new Date('2026-06-30T00:00:00+07:00'); // 30 Jun WIB
      const { gte, lte } = wibRangeBounds(start, end);
      expect(gte!.toISOString()).toBe('2026-05-31T17:00:00.000Z');
      expect(lte!.toISOString()).toBe('2026-06-30T16:59:59.999Z');
    });

    it('an entry stored at WIB midnight of the end day is inside the range', () => {
      const { gte, lte } = wibRangeBounds(
        new Date('2026-06-01T00:00:00+07:00'),
        new Date('2026-06-30T00:00:00+07:00'),
      );
      const entry = businessDateToEntryDate('2026-06-30'); // 30 Jun 00:00 WIB
      expect(entry >= gte!).toBe(true);
      expect(entry <= lte!).toBe(true);
    });

    it('an entry on 1 Jul is excluded from a range ending 30 Jun', () => {
      const { lte } = wibRangeBounds(
        new Date('2026-06-01T00:00:00+07:00'),
        new Date('2026-06-30T00:00:00+07:00'),
      );
      const jul1 = businessDateToEntryDate('2026-07-01');
      expect(jul1 > lte!).toBe(true);
    });

    it('returns empty object when both dates are omitted', () => {
      expect(wibRangeBounds()).toEqual({});
      expect(wibRangeBounds(null, null)).toEqual({});
    });

    it('supports open-ended ranges', () => {
      expect(wibRangeBounds(new Date('2026-06-01T00:00:00+07:00')).lte).toBeUndefined();
      expect(wibRangeBounds(undefined, new Date('2026-06-30T00:00:00+07:00')).gte).toBeUndefined();
    });
  });

  describe('formatWibDate', () => {
    it('formats UTC date to WIB date-only', () => {
      // Jul 2 00:00 WIB
      expect(formatWibDate('2026-07-01T17:00:00.000Z', 'dd MMM yyyy')).toBe('02 Jul 2026');
    });

    it('formats date-only string directly', () => {
      expect(formatWibDate('2026-07-02', 'dd MMM yyyy')).toBe('02 Jul 2026');
    });

    it('default pattern is dd MMM yyyy', () => {
      expect(formatWibDate('2026-07-02')).toBe('02 Jul 2026');
    });

    it('returns "-" for invalid date', () => {
      expect(formatWibDate('not-a-date')).toBe('-');
    });
  });

  describe('BUSINESS_TIMEZONE constant', () => {
    it('is Asia/Jakarta', () => {
      expect(BUSINESS_TIMEZONE).toBe('Asia/Jakarta');
    });
  });
});
