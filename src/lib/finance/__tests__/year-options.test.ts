import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildYearOptions } from '../year-options';

afterEach(() => {
  vi.useRealTimers();
});

describe('buildYearOptions', () => {
  it('returns ascending range 2024-2028 for explicit base year 2026', () => {
    expect(buildYearOptions(2026)).toEqual([
      2024, 2025, 2026, 2027, 2028,
    ]);
  });

  it('returns strictly ascending order', () => {
    const years = buildYearOptions(2026);
    for (let i = 1; i < years.length; i++) {
      expect(years[i]).toBeGreaterThan(years[i - 1]);
    }
  });

  it('contains no duplicates', () => {
    const years = buildYearOptions(2026);
    expect(new Set(years).size).toBe(years.length);
  });

  it('produces strings suitable for Select values', () => {
    for (const y of buildYearOptions(2026)) {
      expect(String(y)).toMatch(/^\d{4}$/);
    }
  });

  it('ignores current date when explicit year is passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2035-06-15'));
    expect(buildYearOptions(2026)).toEqual([
      2024, 2025, 2026, 2027, 2028,
    ]);
  });

  it('defaults to current year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15'));
    expect(buildYearOptions()).toEqual([2024, 2025, 2026, 2027, 2028]);
  });

  it('always includes the current year and future years', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01'));
    const years = buildYearOptions();
    expect(years).toContain(2026);
    expect(years).toContain(2027);
    expect(years).toContain(2028);
  });
});
