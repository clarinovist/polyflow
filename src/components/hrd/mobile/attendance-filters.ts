import { attendanceStatusLabel } from '@/lib/hrd/attendance-status-label';

export const ATTENDANCE_STATUS_FILTERS = [
    'ALL',
    'PRESENT',
    'ABSENT',
    'ON_LEAVE',
    'NO_RECORD',
    'LATE',
] as const;

export type AttendanceStatusFilter = (typeof ATTENDANCE_STATUS_FILTERS)[number];

export const ATTENDANCE_FILTER_ALL_LABEL = 'Semua Status';
export const ATTENDANCE_BASE_PATH = '/hrd/mobile/attendance';

const ROLE_LABELS: Record<string, string> = {
    ADMIN: 'Admin',
    WAREHOUSE: 'Gudang',
    PRODUCTION: 'Produksi',
    SALES: 'Penjualan',
    PLANNING: 'Perencanaan',
    FINANCE: 'Keuangan',
    PROCUREMENT: 'Pengadaan',
    MARKETING: 'Pemasaran',
    FACTORY_MANAGER: 'Manajer Pabrik',
};

export interface AttendanceHrefFilters {
    date?: string;
    workShiftId?: string;
    status?: string;
    q?: string;
}

/** Validates a URL value against the known filters; never a bare cast. */
export function parseAttendanceStatus(
    value: string | undefined,
): AttendanceStatusFilter {
    return ATTENDANCE_STATUS_FILTERS.find((s) => s === value) ?? 'ALL';
}

export function attendanceFilterLabel(status: AttendanceStatusFilter): string {
    return status === 'ALL'
        ? ATTENDANCE_FILTER_ALL_LABEL
        : attendanceStatusLabel(status);
}

/** Builds the list URL; defaults and page 1 are omitted to keep URLs short. */
export function buildAttendanceHref(
    filters: AttendanceHrefFilters,
    page: number,
): string {
    const params = new URLSearchParams();
    if (filters.date) params.set('date', filters.date);
    if (filters.workShiftId) params.set('shift', filters.workShiftId);
    if (filters.status && filters.status !== 'ALL')
        params.set('status', filters.status);
    if (filters.q?.trim()) params.set('q', filters.q.trim());
    if (page > 1) params.set('page', String(page));
    const query = params.toString();
    return query ? `${ATTENDANCE_BASE_PATH}?${query}` : ATTENDANCE_BASE_PATH;
}

/** "21–40 dari 45" for the rows on the current page. */
export function describePageRange(
    page: number,
    pageSize: number,
    returned: number,
    total: number,
): string {
    if (returned <= 0 || total <= 0) return `0 dari ${total}`;
    const start = (page - 1) * pageSize + 1;
    return `${start}–${start + returned - 1} dari ${total}`;
}

function titleCase(code: string): string {
    return code
        .toLowerCase()
        .split('_')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/** Human-readable job role; employee roles are free-form codes. */
export function employeeRoleLabel(role: string): string {
    const code = role.trim();
    if (!code) return '-';
    const upper = code.toUpperCase();
    if (upper === 'HRD') return 'HRD';
    return ROLE_LABELS[upper] ?? titleCase(code);
}
