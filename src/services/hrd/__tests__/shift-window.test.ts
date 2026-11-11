import { describe, it, expect } from 'vitest';
import {
  isOvernightShift,
  isLateForShift,
  calcPlannedHours,
  resolveWorkDate,
  calcActualHours,
  calcOvertimeHours,
  calcRegularHours,
  getEffectivePlannedHours,
  parseWibDateTime,
} from '../shift-window';

describe('shift-window', () => {
  describe('isOvernightShift', () => {
    it('returns true for 22:00→06:00', () => {
      expect(isOvernightShift('22:00', '06:00')).toBe(true);
    });
    it('returns false for 06:00→14:00', () => {
      expect(isOvernightShift('06:00', '14:00')).toBe(false);
    });
  });

  describe('isLateForShift', () => {
    it('uses the work-date shift start in WIB plus grace', () => {
      expect(isLateForShift(new Date('2026-07-15T01:11:00Z'), '2026-07-15', '08:00', 10)).toBe(true);
      expect(isLateForShift(new Date('2026-07-15T01:10:00Z'), '2026-07-15', '08:00', 10)).toBe(false);
    });
    it('keeps after-midnight overnight clock-ins attached to the prior work date', () => {
      expect(isLateForShift(new Date('2026-07-15T18:30:00Z'), '2026-07-15', '20:00', 0)).toBe(true);
    });
  });

  describe('calcPlannedHours', () => {
    it('8h shift: 06:00→14:00', () => {
      expect(calcPlannedHours('06:00', '14:00')).toBe(8);
    });
    it('12h shift: 06:00→18:00', () => {
      expect(calcPlannedHours('06:00', '18:00')).toBe(12);
    });
    it('overnight 8h: 22:00→06:00', () => {
      expect(calcPlannedHours('22:00', '06:00')).toBe(8);
    });
    it('custom 7.5h: 08:00→15:30', () => {
      expect(calcPlannedHours('08:00', '15:30')).toBe(7.5);
    });
    it('returns null for invalid time', () => {
      expect(calcPlannedHours('abc', '14:00')).toBeNull();
    });
  });

  describe('resolveWorkDate', () => {
    it('normal day clock-in → same date', () => {
      // 08:05 WIB = 01:05 UTC
      const clockIn = new Date('2026-07-15T01:05:00.000Z');
      const result = resolveWorkDate(clockIn, '08:00', '16:00');
      expect(result.toISOString().slice(0, 10)).toBe('2026-07-15');
    });
    it('overnight shift 20-08: clock-in 21:00 WIB → same day (after shift start)', () => {
      // 21:00 WIB = 14:00 UTC
      const clockIn = new Date('2026-07-15T14:00:00.000Z');
      const result = resolveWorkDate(clockIn, '20:00', '08:00');
      expect(result.toISOString().slice(0, 10)).toBe('2026-07-15');
    });
    it('overnight shift 20-08: clock-in 01:30 WIB → H-1', () => {
      // 01:30 WIB = 18:30 UTC previous day
      const clockIn = new Date('2026-07-14T18:30:00.000Z');
      const result = resolveWorkDate(clockIn, '20:00', '08:00');
      expect(result.toISOString().slice(0, 10)).toBe('2026-07-14');
    });
    it('overnight shift 20-08: clock-in 20:00 exact → same day', () => {
      // 20:00 WIB = 13:00 UTC
      const clockIn = new Date('2026-07-15T13:00:00.000Z');
      const result = resolveWorkDate(clockIn, '20:00', '08:00');
      expect(result.toISOString().slice(0, 10)).toBe('2026-07-15');
    });
    it('overnight shift 20-08: clock-in 07:59 WIB → H-1', () => {
      // 07:59 WIB = 00:59 UTC
      const clockIn = new Date('2026-07-15T00:59:00.000Z');
      const result = resolveWorkDate(clockIn, '20:00', '08:00');
      expect(result.toISOString().slice(0, 10)).toBe('2026-07-14');
    });
    it('normal shift 08-16: early arrival 07:59 WIB → same day', () => {
      // 07:59 WIB = 00:59 UTC
      const clockIn = new Date('2026-07-15T00:59:00.000Z');
      const result = resolveWorkDate(clockIn, '08:00', '16:00');
      expect(result.toISOString().slice(0, 10)).toBe('2026-07-15');
    });

    // Work date = previous day ONLY when an overnight clock-in happens before
    // the shift END (an after-midnight arrival for a shift that began
    // yesterday). Being before shift START is not enough: an early arrival
    // (15:30 for a 16:00 shift) or a midday arrival (12:00 for a 20:00 shift)
    // belongs to today's shift. Inputs are WIB wall-clock times, converted to
    // the UTC instants the app actually receives.
    const wib = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
    const workDateOf = (clockIn: Date, start: string, end: string) =>
      resolveWorkDate(clockIn, start, end).toISOString().slice(0, 10);

    describe.each([
      // [label, start, end, clock-in WIB time, expected work date]
      ['20:00-08:00 07:30 (before end, after midnight)', '20:00', '08:00', '07:30', '2026-07-14'],
      ['20:00-08:00 00:30 (after midnight)', '20:00', '08:00', '00:30', '2026-07-14'],
      ['20:00-08:00 08:00 (exactly at end)', '20:00', '08:00', '08:00', '2026-07-15'],
      ['20:00-08:00 12:00 (midday, was H-1 bug)', '20:00', '08:00', '12:00', '2026-07-15'],
      ['20:00-08:00 19:30 (early arrival, was H-1 bug)', '20:00', '08:00', '19:30', '2026-07-15'],
      ['20:00-08:00 20:05 (after start)', '20:00', '08:00', '20:05', '2026-07-15'],
      ['20:00-08:00 23:59 (before midnight)', '20:00', '08:00', '23:59', '2026-07-15'],
      ['23:00-07:00 06:30 (before end)', '23:00', '07:00', '06:30', '2026-07-14'],
      ['23:00-07:00 12:00 (midday)', '23:00', '07:00', '12:00', '2026-07-15'],
      ['23:00-07:00 22:30 (early arrival)', '23:00', '07:00', '22:30', '2026-07-15'],
      ['19:00-07:00 06:59 (before end)', '19:00', '07:00', '06:59', '2026-07-14'],
      ['19:00-07:00 07:00 (exactly at end)', '19:00', '07:00', '07:00', '2026-07-15'],
      ['19:00-07:00 18:30 (early arrival)', '19:00', '07:00', '18:30', '2026-07-15'],
      // 16:00-00:00 ends exactly at midnight: isOvernightShift is true, but no
      // clock-in can be "before 00:00", so the work date is never H-1.
      ['16:00-00:00 15:30 (early arrival, was H-1 bug)', '16:00', '00:00', '15:30', '2026-07-15'],
      ['16:00-00:00 16:05', '16:00', '00:00', '16:05', '2026-07-15'],
      ['16:00-00:00 23:50', '16:00', '00:00', '23:50', '2026-07-15'],
      // Regular and midnight-start shifts are unchanged.
      ['08:00-16:00 07:59', '08:00', '16:00', '07:59', '2026-07-15'],
      ['08:00-16:00 08:05', '08:00', '16:00', '08:05', '2026-07-15'],
      ['00:00-08:00 00:05', '00:00', '08:00', '00:05', '2026-07-15'],
      ['00:00-08:00 07:30', '00:00', '08:00', '07:30', '2026-07-15'],
      ['00:00-08:00 23:30', '00:00', '08:00', '23:30', '2026-07-15'],
    ])('%s', (_label, start, end, time, expected) => {
      it(`resolves to ${expected}`, () => {
        expect(workDateOf(wib('2026-07-15', time), start, end)).toBe(expected);
      });
    });

    it('16:00-00:00 clock-in at 00:10 next calendar day → that calendar day (not a new-shift arrival)', () => {
      // A session that runs past midnight is the SAME open session (clock-in was
      // at 16:xx); a fresh clock-in at 00:10 is a different, off-shift event
      // and follows plain WIB calendar semantics because the shift ends at 00:00.
      expect(workDateOf(wib('2026-07-16', '00:10'), '16:00', '00:00')).toBe('2026-07-16');
    });

    it('returns a UTC-midnight Date for the WIB calendar day', () => {
      const result = resolveWorkDate(wib('2026-07-15', '07:30'), '20:00', '08:00');
      expect(result.toISOString()).toBe('2026-07-14T00:00:00.000Z');
    });

    it('uses WIB, not UTC, for the clock-in hour', () => {
      // 2026-07-14T23:30Z is 06:30 WIB on 15 July → before the 08:00 end → H-1 (14 July).
      expect(workDateOf(new Date('2026-07-14T23:30:00.000Z'), '20:00', '08:00')).toBe('2026-07-14');
      // 2026-07-15T05:00Z is 12:00 WIB → today.
      expect(workDateOf(new Date('2026-07-15T05:00:00.000Z'), '20:00', '08:00')).toBe('2026-07-15');
    });
  });

  describe('calcActualHours', () => {
    it('8h worked', () => {
      const inTime = new Date('2026-07-15T06:00:00Z');
      const outTime = new Date('2026-07-15T14:00:00Z');
      expect(calcActualHours(inTime, outTime)).toBe(8);
    });
    it('12h 5min worked', () => {
      const inTime = new Date('2026-07-15T06:00:00Z');
      const outTime = new Date('2026-07-15T18:05:00Z');
      expect(calcActualHours(inTime, outTime)).toBe(12.08);
    });
  });

  describe('calcOvertimeHours', () => {
    it('returns 4h OT for 12h actual on 8h planned', () => {
      expect(calcOvertimeHours(12, 8)).toBe(4);
    });
    it('returns 0 for 8h actual on 8h planned', () => {
      expect(calcOvertimeHours(8, 8)).toBe(0);
    });
    it('returns 0 for 7.9h actual on 8h planned (early out)', () => {
      expect(calcOvertimeHours(7.9, 8)).toBe(0);
    });
    it('returns 0.1 for 12.1h actual on 12h planned', () => {
      expect(calcOvertimeHours(12.1, 12)).toBe(0.1);
    });
  });

  describe('calcRegularHours', () => {
    it('returns actual when actual < planned', () => {
      expect(calcRegularHours(7.9, 8)).toBe(7.9);
    });
    it('returns planned when actual > planned', () => {
      expect(calcRegularHours(12, 8)).toBe(8);
    });
  });

  describe('getEffectivePlannedHours', () => {
    it('uses explicit plannedHours when set', () => {
      expect(getEffectivePlannedHours(12, '06:00', '18:00')).toBe(12);
    });
    it('calculates from times when null', () => {
      expect(getEffectivePlannedHours(null, '06:00', '14:00')).toBe(8);
    });
    it('falls back to 8h when times are invalid', () => {
      expect(getEffectivePlannedHours(null, 'invalid', 'invalid')).toBe(8);
    });
  });

  describe('parseWibDateTime', () => {
    it('parses naive datetime (no seconds) as WIB', () => {
      const result = parseWibDateTime('2026-07-28T16:00');
      expect(result.toISOString()).toBe('2026-07-28T09:00:00.000Z');
    });

    it('parses naive datetime with seconds as WIB', () => {
      const result = parseWibDateTime('2026-07-28T16:00:30');
      expect(result.toISOString()).toBe('2026-07-28T09:00:30.000Z');
    });

    it('parses naive datetime with milliseconds as WIB', () => {
      const result = parseWibDateTime('2026-07-28T16:00:30.123');
      expect(result.toISOString()).toBe('2026-07-28T09:00:30.123Z');
    });

    it('honours explicit Z suffix', () => {
      const result = parseWibDateTime('2026-07-28T09:00:00Z');
      expect(result.toISOString()).toBe('2026-07-28T09:00:00.000Z');
    });

    it('honours explicit +07:00 offset', () => {
      const result = parseWibDateTime('2026-07-28T16:00:00+07:00');
      expect(result.toISOString()).toBe('2026-07-28T09:00:00.000Z');
    });

    it('honours explicit -05:00 offset', () => {
      const result = parseWibDateTime('2026-07-28T04:00:00-05:00');
      expect(result.toISOString()).toBe('2026-07-28T09:00:00.000Z');
    });

    it('throws on empty string', () => {
      expect(() => parseWibDateTime('')).toThrow('Input datetime tidak valid');
    });

    it('throws on random text', () => {
      expect(() => parseWibDateTime('bukan tanggal')).toThrow(
        'Format datetime tidak valid',
      );
    });

    it('throws on incomplete date', () => {
      expect(() => parseWibDateTime('2026-07-28')).toThrow(
        'Format datetime tidak valid',
      );
    });
  });
});
