/**
 * Konstanta + tipe bersama koreksi massal sesi lupa pulang. Sengaja bukan file
 * 'use server' (aturan Next: file 'use server' hanya boleh mengekspor async
 * function), sehingga aman diimpor service, aksi, dan UI.
 */

export type ClosurePolicy = 'SHIFT_END' | 'CLOCK_IN_PLUS_PLANNED';

export const CLOSURE_POLICIES: readonly ClosurePolicy[] = [
    'SHIFT_END',
    'CLOCK_IN_PLUS_PLANNED',
];

/** Maksimum record per pratinjau/eksekusi (satu transaksi). */
export const CLOSURE_MAX_BATCH = 200;

/** Batas waktu transaksi terapkan (ms); 200 record × 4 query + audit. */
export const CLOSURE_TX_TIMEOUT_MS = 30_000;

/** Label kebijakan untuk catatan record, audit, dan UI. */
export const CLOSURE_POLICY_LABELS: Record<ClosurePolicy, string> = {
    SHIFT_END: 'Akhir shift terjadwal',
    CLOCK_IN_PLUS_PLANNED: 'Jam masuk + durasi terjadwal',
};

export const CLOSURE_AUDIT_ACTION_RECORD = 'ATTENDANCE_BULK_CLOSED';
export const CLOSURE_AUDIT_ACTION_BATCH = 'ATTENDANCE_BULK_CLOSURE_BATCH';
export const CLOSURE_AUDIT_ENTITY_RECORD = 'AttendanceRecord';
export const CLOSURE_AUDIT_ENTITY_BATCH = 'AttendanceBulkClosure';

export const CLOSURE_STALE_DATA_MESSAGE =
    'Data berubah sejak pratinjau, buat pratinjau ulang';

export interface ClosurePreviewRow {
    id: string;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    /** YYYY-MM-DD; kosong bila record tidak ditemukan. */
    workDate: string;
    /** Senin YYYY-MM-DD; kosong bila record tidak ditemukan. */
    weekStart: string;
    shiftName: string;
    /** ISO; kosong bila record tidak ditemukan / tanpa jam masuk. */
    clockInAt: string;
    proposedClockOutAt: string | null;
    actualHours: number | null;
    regularHours: number;
    overtimeHours: number;
    earnings: number;
    eligible: boolean;
    reason?: string;
    warning?: string;
}

export interface ClosurePreview {
    policy: ClosurePolicy;
    fingerprint: string;
    /** ISO */
    generatedAt: string;
    rows: ClosurePreviewRow[];
    totals: {
        eligibleCount: number;
        ineligibleCount: number;
        earnings: number;
    };
    byEmployee: Array<{
        employeeId: string;
        employeeName: string;
        eligibleCount: number;
        earnings: number;
    }>;
    byWeek: Array<{
        weekStart: string;
        eligibleCount: number;
        earnings: number;
    }>;
}

export interface ClosureApplyResult {
    batchId: string;
    closedCount: number;
    skippedCount: number;
    earningsAdded: number;
}
