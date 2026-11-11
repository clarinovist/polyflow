/**
 * Pure helpers for the employee directory (B0).
 * Unit-testable, no side effects.
 */

import { wibDateStringFrom } from '@/services/hrd/shift-window';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const URGENCY_WINDOW_DAYS = 30;

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
export function matchesEmployeeFilters(
    emp: EmployeeRecord,
    filters: DirectoryFilters,
): boolean {
    if (filters.status && emp.status !== filters.status) return false;
    if (filters.payType && emp.payType !== filters.payType) return false;
    if (filters.employment && emp.employmentStatus !== filters.employment)
        return false;
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
        return salary > 0
            ? `Rp ${salary.toLocaleString('id-ID')}/bln`
            : 'Belum diisi';
    }
    return '—';
}

export type EmploymentEndSource = Pick<
    EmployeeRecord,
    'status' | 'employmentStatus' | 'probationEndDate' | 'contractEndDate'
>;

/** Get the end date for urgency badge based on employment status. */
function getEndDate(emp: EmploymentEndSource): Date | null {
    if (emp.employmentStatus === 'PROBATION' && emp.probationEndDate) {
        return new Date(emp.probationEndDate);
    }
    if (emp.employmentStatus === 'CONTRACT' && emp.contractEndDate) {
        return new Date(emp.contractEndDate);
    }
    return null;
}

function wibDayNumber(date: Date): number {
    return Date.parse(`${wibDateStringFrom(date)}T00:00:00.000Z`) / MS_PER_DAY;
}

/** Whole WIB calendar days from asOf (default: now) to a target date. */
export function daysUntil(targetDate: Date, asOf?: Date): number {
    return wibDayNumber(targetDate) - wibDayNumber(asOf ?? new Date());
}

export interface UrgencyBadge {
    text: string;
    variant: 'amber' | 'red' | null;
}

/** Get urgency badge for probation/contract end date. Returns null if no urgency. */
export function urgencyBadge(
    emp: EmploymentEndSource,
    asOf?: Date,
): UrgencyBadge | null {
    if (emp.status !== 'ACTIVE') return null;
    const endDate = getEndDate(emp);
    if (!endDate) return null;
    const days = daysUntil(endDate, asOf);
    if (days > URGENCY_WINDOW_DAYS) return null;
    if (days >= 0) return { text: `Habis ${days} hr`, variant: 'amber' };
    return { text: `Lewat ${Math.abs(days)} hr`, variant: 'red' };
}
