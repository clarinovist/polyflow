/**
 * Pure helpers for the employee directory (B0).
 * Unit-testable, no side effects.
 */

export interface EmployeeRecord {
  id: string;
  name: string;
  code: string;
  role: string;
  status: string;
  payType: string;
  employmentStatus: string;
  dailyRate: number | { toNumber(): number };
  monthlySalary: number | { toNumber(): number } | null;
  probationEndDate: Date | string | null;
  contractEndDate: Date | string | null;
}

export interface DirectoryFilters {
  q?: string;
  payType?: string;
  employment?: string;
  status?: string;
}

function toN(v: number | { toNumber(): number } | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : v.toNumber();
}

/** Check if an employee matches the given directory filters. */
export function matchesEmployeeFilters(emp: EmployeeRecord, filters: DirectoryFilters): boolean {
  if (filters.status && emp.status !== filters.status) return false;
  if (filters.payType && emp.payType !== filters.payType) return false;
  if (filters.employment && emp.employmentStatus !== filters.employment) return false;
  if (filters.q) {
    const q = filters.q.toLowerCase();
    const matchName = emp.name.toLowerCase().includes(q);
    const matchCode = emp.code.toLowerCase().includes(q);
    if (!matchName && !matchCode) return false;
  }
  return true;
}

/** Format salary summary text for the directory list. */
export function salarySummaryText(emp: EmployeeRecord): string {
  if (emp.payType === 'PIECE') return 'Borongan';
  if (emp.payType === 'DAILY') {
    const rate = toN(emp.dailyRate);
    return rate > 0 ? `Rp ${rate.toLocaleString('id-ID')}/hari` : '—';
  }
  if (emp.payType === 'MONTHLY') {
    const salary = emp.monthlySalary != null ? toN(emp.monthlySalary) : 0;
    return salary > 0 ? `Rp ${salary.toLocaleString('id-ID')}/bln` : 'Belum diisi';
  }
  return '—';
}

/** Get the end date for urgency badge based on employment status. */
function getEndDate(emp: EmployeeRecord): Date | null {
  if (emp.employmentStatus === 'PROBATION' && emp.probationEndDate) {
    return new Date(emp.probationEndDate);
  }
  if (emp.employmentStatus === 'CONTRACT' && emp.contractEndDate) {
    return new Date(emp.contractEndDate);
  }
  return null;
}

/** Calculate days remaining from today to a target date. */
export function daysUntil(targetDate: Date, asOf?: Date): number {
  const now = asOf ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export interface UrgencyBadge {
  text: string;
  variant: 'amber' | 'red' | null;
}

/** Get urgency badge for probation/contract end date. Returns null if no urgency. */
export function urgencyBadge(emp: EmployeeRecord, asOf?: Date): UrgencyBadge | null {
  if (emp.status !== 'ACTIVE') return null;
  const endDate = getEndDate(emp);
  if (!endDate) return null;
  const days = daysUntil(endDate, asOf);
  if (days > 30) return null;
  if (days >= 0) return { text: `Habis ${days} hr`, variant: 'amber' };
  return { text: `Lewat ${Math.abs(days)} hr`, variant: 'red' };
}
