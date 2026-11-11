import { todayWibDateString } from '@/services/hrd/shift-window';

/** Nilai `status` pada URL (K3) + dua nilai internal ('all', 'present'). */
export const STATUS_FILTERS = [
    'all',
    'present',
    'late',
    'leave',
    'absent',
    'norecord',
    'outside',
    'nophoto',
    'stale',
] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Label filter/lencana sesi yang lupa pulang (tanpa jam pulang > 20 jam). */
export const STALE_FILTER_LABEL = 'Lupa pulang';

/** Label seragam untuk istilah shift ganda di rekap harian/mingguan/bulanan. */
export const MULTI_SHIFT_LABEL = 'Shift Ganda';

const YEAR_RANGE = 2;

/** Bentuk minimal record absensi yang dipakai ringkasan dan filter. */
export interface RecapRecord {
    id: string;
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    status: string;
    isLate?: boolean;
    isOutsideRadius?: boolean;
    hasValidSelfie?: boolean;
}

export interface AttendanceSummaryCounts {
    present: number;
    late: number;
    onLeave: number;
    absent: number;
    /** Null selagi daftar "Belum absen" belum termuat / gagal dimuat. */
    noRecord: number | null;
    outsideRadius: number;
    noSelfie: number;
}

export function parseStatusFilter(raw: string | null | undefined): StatusFilter {
    return STATUS_FILTERS.find((f) => f === raw) ?? 'all';
}

const STATUS_PRIORITY: Record<string, number> = {
    PRESENT: 3,
    ON_LEAVE: 2,
    ABSENT: 1,
};

function priorityOf(record: RecapRecord): number {
    return STATUS_PRIORITY[record.status] ?? 0;
}

/** Satu record terkuat per karyawan: PRESENT > ON_LEAVE > ABSENT. */
function strongestPerEmployee(records: RecapRecord[]): RecapRecord[] {
    const best = new Map<string, RecapRecord>();
    for (const record of records) {
        const current = best.get(record.employeeId);
        if (!current || priorityOf(record) > priorityOf(current)) {
            best.set(record.employeeId, record);
        }
    }
    return Array.from(best.values());
}

function presentEmployeeIds(
    records: RecapRecord[],
    predicate: (r: RecapRecord) => boolean,
): number {
    const ids = new Set<string>();
    for (const r of records) {
        if (r.status === 'PRESENT' && predicate(r)) ids.add(r.employeeId);
    }
    return ids.size;
}

/** Ringkasan per KARYAWAN (bukan per record): dua shift sehari = satu orang. */
export function summarizeAttendance(
    records: RecapRecord[],
    noRecordCount: number | null,
): AttendanceSummaryCounts {
    const strongest = strongestPerEmployee(records);
    const countStatus = (status: string) =>
        strongest.filter((r) => r.status === status).length;
    return {
        present: countStatus('PRESENT'),
        late: presentEmployeeIds(records, (r) => r.isLate === true),
        onLeave: countStatus('ON_LEAVE'),
        absent: countStatus('ABSENT'),
        noRecord: noRecordCount,
        outsideRadius: presentEmployeeIds(
            records,
            (r) => r.isOutsideRadius === true,
        ),
        noSelfie: presentEmployeeIds(records, (r) => r.hasValidSelfie === false),
    };
}

const STATUS_MATCHERS: Record<StatusFilter, (r: RecapRecord) => boolean> = {
    all: () => true,
    present: (r) => r.status === 'PRESENT',
    late: (r) => r.status === 'PRESENT' && r.isLate === true,
    leave: (r) => r.status === 'ON_LEAVE',
    absent: (r) => r.status === 'ABSENT',
    // Orang "belum absen" tidak punya record: panel tersendiri yang menampilkannya.
    norecord: () => false,
    outside: (r) => r.status === 'PRESENT' && r.isOutsideRadius === true,
    nophoto: (r) => r.status === 'PRESENT' && r.hasValidSelfie === false,
    // Sesi lupa pulang lintas tanggal: panel tersendiri yang menampilkannya.
    stale: () => false,
};

export function filterAttendanceRecords<T extends RecapRecord>(
    records: T[],
    status: StatusFilter,
    query: string,
): T[] {
    const needle = query.trim().toLowerCase();
    const matchesStatus = STATUS_MATCHERS[status];
    return records.filter(
        (r) =>
            matchesStatus(r) &&
            (!needle ||
                r.employeeName.toLowerCase().includes(needle) ||
                r.employeeCode.toLowerCase().includes(needle)),
    );
}

/** Tahun berjalan ±2, ditambah tahun terpilih bila di luar rentang. */
export function buildYearOptions(
    selectedYear: number,
    currentYear: number,
): number[] {
    const years = new Set<number>([selectedYear]);
    for (let y = currentYear - YEAR_RANGE; y <= currentYear + YEAR_RANGE; y++) {
        years.add(y);
    }
    return Array.from(years).sort((a, b) => a - b);
}

/** Tahun berjalan menurut kalender WIB. */
export function currentWibYear(): number {
    return Number(todayWibDateString().slice(0, 4));
}

/** Tanggal kerja yang belum tiba tidak boleh ditandai tidak hadir. */
export function isFutureWorkDate(
    workDate: string,
    today: string = todayWibDateString(),
): boolean {
    return workDate > today;
}
