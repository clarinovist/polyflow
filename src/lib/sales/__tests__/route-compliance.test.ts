import { describe, it, expect } from 'vitest';
import {
  calculateComplianceRate,
  getInitialReviewStatus,
  isReviewPendingReason,
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
