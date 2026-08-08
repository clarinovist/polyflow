import { describe, it, expect } from 'vitest';
import {
  calculateComplianceRate,
  getInitialReviewStatus,
  isReviewPendingReason,
  getMondayOfWeek,
  getRouteWeekDates,
  describeVisitAge,
  OVERDUE_VISIT_DAYS,
} from '../route-compliance';

describe('calculateComplianceRate', () => {
  it('normal case', () => {
    expect(
      calculateComplianceRate({ assigned: 10, visited: 8, extraCalls: 2 }),
    ).toBe(60);
  });

  it('assigned 0 returns 0 not NaN', () => {
    const r = calculateComplianceRate({ assigned: 0, visited: 0, extraCalls: 0 });
    expect(r).toBe(0);
    expect(Number.isNaN(r)).toBe(false);
    expect(Number.isFinite(r)).toBe(true);
  });

  it('assigned 0 with visits returns 0', () => {
    expect(
      calculateComplianceRate({ assigned: 0, visited: 5, extraCalls: 1 }),
    ).toBe(0);
  });

  it('100% compliance when visited equals assigned no EC', () => {
    expect(
      calculateComplianceRate({ assigned: 5, visited: 5, extraCalls: 0 }),
    ).toBe(100);
  });

  it('rounds result', () => {
    // (2-0)/3 = 66.666... → 67
    expect(
      calculateComplianceRate({ assigned: 3, visited: 2, extraCalls: 0 }),
    ).toBe(67);
  });

  it('extraCalls deducted from visited', () => {
    expect(
      calculateComplianceRate({ assigned: 10, visited: 10, extraCalls: 10 }),
    ).toBe(0);
  });
});

describe('isReviewPendingReason', () => {
  it('TOKO_BARU true', () => expect(isReviewPendingReason('TOKO_BARU')).toBe(true));
  it('PERMINTAAN_DADAKAN true', () =>
    expect(isReviewPendingReason('PERMINTAAN_DADAKAN')).toBe(true));
  it('DEKAT_RUTE false', () =>
    expect(isReviewPendingReason('DEKAT_RUTE')).toBe(false));
  it('TOKO_TUTUP_GANTI false', () =>
    expect(isReviewPendingReason('TOKO_TUTUP_GANTI')).toBe(false));
  it('null false', () => expect(isReviewPendingReason(null)).toBe(false));
  it('undefined false', () => expect(isReviewPendingReason(undefined)).toBe(false));
});

describe('getInitialReviewStatus', () => {
  it('EC TOKO_BARU → PENDING', () =>
    expect(
      getInitialReviewStatus({ isExtraCall: true, extraReason: 'TOKO_BARU' }),
    ).toBe('PENDING'));
  it('EC PERMINTAAN_DADAKAN → PENDING', () =>
    expect(
      getInitialReviewStatus({
        isExtraCall: true,
        extraReason: 'PERMINTAAN_DADAKAN',
      }),
    ).toBe('PENDING'));
  it('EC DEKAT_RUTE → NOT_REQUIRED', () =>
    expect(
      getInitialReviewStatus({ isExtraCall: true, extraReason: 'DEKAT_RUTE' }),
    ).toBe('NOT_REQUIRED'));
  it('EC TOKO_TUTUP_GANTI → NOT_REQUIRED', () =>
    expect(
      getInitialReviewStatus({
        isExtraCall: true,
        extraReason: 'TOKO_TUTUP_GANTI',
      }),
    ).toBe('NOT_REQUIRED'));
  it('non-EC → NOT_REQUIRED', () =>
    expect(
      getInitialReviewStatus({ isExtraCall: false, extraReason: 'TOKO_BARU' }),
    ).toBe('NOT_REQUIRED'));
  it('EC no reason → NOT_REQUIRED', () =>
    expect(getInitialReviewStatus({ isExtraCall: true })).toBe('NOT_REQUIRED'));
});

describe('getMondayOfWeek', () => {
  it('returns the same date when input is already Monday', () => {
    const monday = new Date('2026-08-03T00:00:00.000Z');
    expect(getMondayOfWeek(monday).toISOString().split('T')[0]).toBe(
      '2026-08-03',
    );
  });

  it('rolls a mid-week date back to Monday', () => {
    const wednesday = new Date('2026-08-05T14:30:00.000Z');
    expect(getMondayOfWeek(wednesday).toISOString().split('T')[0]).toBe(
      '2026-08-03',
    );
  });

  it('rolls Sunday back to the Monday that started its week (not forward)', () => {
    const sunday = new Date('2026-08-09T00:00:00.000Z');
    expect(getMondayOfWeek(sunday).toISOString().split('T')[0]).toBe(
      '2026-08-03',
    );
  });

  it('normalizes time-of-day to UTC midnight', () => {
    const monday = getMondayOfWeek(new Date('2026-08-05T23:59:59.999Z'));
    expect(monday.getUTCHours()).toBe(0);
    expect(monday.getUTCMinutes()).toBe(0);
  });
});

describe('getRouteWeekDates', () => {
  it('returns 6 consecutive dates (Senin–Sabtu) starting from weekStart', () => {
    const dates = getRouteWeekDates(new Date('2026-08-03T00:00:00.000Z'));
    expect(dates).toHaveLength(6);
    expect(dates.map((d) => d.toISOString().split('T')[0])).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
    ]);
  });
});

describe('describeVisitAge', () => {
  it('marks never-visited (daysSince null) distinctly — not "0 hari", not empty', () => {
    const result = describeVisitAge(null);
    expect(result.neverVisited).toBe(true);
    expect(result.isOverdue).toBe(true);
    expect(result.label).toBe('Belum pernah dikunjungi');
    expect(result.label).not.toBe('');
    expect(result.label).not.toContain('0 hari');
  });

  it('labels a visit today distinctly from never-visited', () => {
    const result = describeVisitAge(0);
    expect(result.neverVisited).toBe(false);
    expect(result.isOverdue).toBe(false);
    expect(result.label).toBe('Hari ini');
  });

  it('is not overdue below the threshold', () => {
    const result = describeVisitAge(15);
    expect(result.isOverdue).toBe(false);
    expect(result.neverVisited).toBe(false);
    expect(result.label).toBe('15 hari lalu');
  });

  it('is not overdue exactly at the threshold (boundary, matches getWeekBoard)', () => {
    const result = describeVisitAge(OVERDUE_VISIT_DAYS);
    expect(result.isOverdue).toBe(false);
  });

  it('is overdue just past the threshold (boundary)', () => {
    const result = describeVisitAge(OVERDUE_VISIT_DAYS + 1);
    expect(result.isOverdue).toBe(true);
    expect(result.neverVisited).toBe(false);
  });
});
