import { describe, it, expect } from 'vitest';
import { tenantHasProsesKhusus } from '../tenant-features';

describe('tenantHasProsesKhusus', () => {
  it('enables HD / Potong-Plong for kiyowo', () => {
    expect(tenantHasProsesKhusus('kiyowo')).toBe(true);
    expect(tenantHasProsesKhusus('Kiyowo')).toBe(true);
  });

  it('disables Proses Khusus for melindo raffia', () => {
    expect(tenantHasProsesKhusus('melindo')).toBe(false);
  });

  it('defaults to off for unknown / empty tenant', () => {
    expect(tenantHasProsesKhusus(null)).toBe(false);
    expect(tenantHasProsesKhusus(undefined)).toBe(false);
    expect(tenantHasProsesKhusus('')).toBe(false);
    expect(tenantHasProsesKhusus('other')).toBe(false);
  });
});
