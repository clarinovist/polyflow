import { describe, it, expect } from 'vitest';
import {
  matchesEmployeeFilters,
  salarySummaryText,
  urgencyBadge,
  daysUntil,
  type EmployeeRecord,
} from '../employee-directory-helpers';

function emp(overrides: Partial<EmployeeRecord> = {}): EmployeeRecord {
  return {
    id: 'e1',
    name: 'Budi Santoso',
    code: 'EMP-001',
    role: 'OPERATOR',
    status: 'ACTIVE',
    payType: 'DAILY',
    employmentStatus: 'PERMANENT',
    dailyRate: 120000,
    monthlySalary: null,
    probationEndDate: null,
    contractEndDate: null,
    ...overrides,
  };
}

describe('matchesEmployeeFilters', () => {
  const e = emp();

  it('matches all when no filters', () => {
    expect(matchesEmployeeFilters(e, {})).toBe(true);
  });

  it('filters by status', () => {
    expect(matchesEmployeeFilters(e, { status: 'ACTIVE' })).toBe(true);
    expect(matchesEmployeeFilters(e, { status: 'INACTIVE' })).toBe(false);
  });

  it('filters by payType', () => {
    expect(matchesEmployeeFilters(e, { payType: 'DAILY' })).toBe(true);
    expect(matchesEmployeeFilters(e, { payType: 'MONTHLY' })).toBe(false);
  });

  it('filters by employmentStatus', () => {
    expect(matchesEmployeeFilters(e, { employment: 'PERMANENT' })).toBe(true);
    expect(matchesEmployeeFilters(e, { employment: 'PROBATION' })).toBe(false);
  });

  it('filters by q matching name (case-insensitive)', () => {
    expect(matchesEmployeeFilters(e, { q: 'budi' })).toBe(true);
    expect(matchesEmployeeFilters(e, { q: 'BUDI' })).toBe(true);
    expect(matchesEmployeeFilters(e, { q: 'santoso' })).toBe(true);
    expect(matchesEmployeeFilters(e, { q: 'sari' })).toBe(false);
  });

  it('filters by q matching code', () => {
    expect(matchesEmployeeFilters(e, { q: 'emp-001' })).toBe(true);
    expect(matchesEmployeeFilters(e, { q: 'EMP' })).toBe(true);
    expect(matchesEmployeeFilters(e, { q: '999' })).toBe(false);
  });

  it('combines multiple filters (AND)', () => {
    expect(matchesEmployeeFilters(e, { status: 'ACTIVE', payType: 'DAILY' })).toBe(true);
    expect(matchesEmployeeFilters(e, { status: 'ACTIVE', payType: 'MONTHLY' })).toBe(false);
  });
});

describe('salarySummaryText', () => {
  it('DAILY with rate', () => {
    expect(salarySummaryText(emp({ payType: 'DAILY', dailyRate: 120000 }))).toBe('Rp 120.000/hari');
  });

  it('DAILY with 0 rate', () => {
    expect(salarySummaryText(emp({ payType: 'DAILY', dailyRate: 0 }))).toBe('—');
  });

  it('PIECE', () => {
    expect(salarySummaryText(emp({ payType: 'PIECE' }))).toBe('Borongan');
  });

  it('MONTHLY with salary', () => {
    expect(salarySummaryText(emp({ payType: 'MONTHLY', monthlySalary: 5500000 }))).toBe('Rp 5.500.000/bln');
  });

  it('MONTHLY without salary', () => {
    expect(salarySummaryText(emp({ payType: 'MONTHLY', monthlySalary: null }))).toBe('Belum diisi');
  });
});

describe('daysUntil', () => {
  it('returns 0 for today', () => {
    const today = new Date();
    expect(daysUntil(today)).toBe(0);
  });

  it('returns positive for future date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    expect(daysUntil(future)).toBe(10);
  });

  it('returns negative for past date', () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    expect(daysUntil(past)).toBe(-5);
  });
});

describe('urgencyBadge', () => {
  const today = new Date(2026, 6, 19); // July 19, 2026

  it('returns null for INACTIVE employee', () => {
    expect(urgencyBadge(emp({ status: 'INACTIVE' }), today)).toBeNull();
  });

  it('returns null for PERMANENT (no end date)', () => {
    expect(urgencyBadge(emp({ employmentStatus: 'PERMANENT' }), today)).toBeNull();
  });

  it('returns amber badge for PROBATION ending in 15 days', () => {
    const endDate = new Date(2026, 7, 3); // Aug 3, 2026
    const result = urgencyBadge(emp({ employmentStatus: 'PROBATION', probationEndDate: endDate }), today);
    expect(result).toEqual({ text: 'Habis 15 hr', variant: 'amber' });
  });

  it('returns red badge for PROBATION already overdue', () => {
    const endDate = new Date(2026, 7, 10); // Aug 10, 2026
    // asOf is Aug 15 → days = -5
    const asOf = new Date(2026, 7, 15);
    const result = urgencyBadge(emp({ employmentStatus: 'PROBATION', probationEndDate: endDate }), asOf);
    expect(result).toEqual({ text: 'Lewat 5 hr', variant: 'red' });
  });

  it('returns null for CONTRACT ending in 45 days (>30)', () => {
    const endDate = new Date(2026, 8, 2); // Sep 2, 2026
    expect(urgencyBadge(emp({ employmentStatus: 'CONTRACT', contractEndDate: endDate }), today)).toBeNull();
  });

  it('returns amber badge for CONTRACT ending in 10 days', () => {
    const endDate = new Date(2026, 6, 29); // Jul 29, 2026
    const result = urgencyBadge(emp({ employmentStatus: 'CONTRACT', contractEndDate: endDate }), today);
    expect(result).toEqual({ text: 'Habis 10 hr', variant: 'amber' });
  });
});
