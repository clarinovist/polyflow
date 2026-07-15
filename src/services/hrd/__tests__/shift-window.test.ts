import { describe, it, expect } from 'vitest';
import {
  isOvernightShift,
  calcPlannedHours,
  resolveWorkDate,
  calcActualHours,
  calcOvertimeHours,
  calcRegularHours,
  getEffectivePlannedHours,
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
});
