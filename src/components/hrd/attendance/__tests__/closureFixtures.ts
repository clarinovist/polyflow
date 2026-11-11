import type {
    ClosureApplyResult,
    ClosurePreview,
} from '../stale-closure-types';

/** Fixture pratinjau koreksi massal (tenant/nama fiktif). */
export const PREVIEW: ClosurePreview = {
    policy: 'SHIFT_END',
    fingerprint: 'fp-abc',
    generatedAt: '2026-11-11T03:00:00.000Z',
    rows: [
        {
            id: 'r1',
            employeeId: 'e1',
            employeeName: 'Budi Contoh',
            employeeCode: 'E001',
            workDate: '2026-11-09',
            weekStart: '2026-11-09',
            shiftName: 'Pagi',
            clockInAt: '2026-11-09T00:05:00.000Z',
            proposedClockOutAt: '2026-11-09T08:00:00.000Z',
            actualHours: 7.92,
            regularHours: 7.92,
            overtimeHours: 0,
            earnings: 100000,
            eligible: true,
        },
        {
            id: 'r2',
            employeeId: 'e2',
            employeeName: 'Siti Contoh',
            employeeCode: 'E002',
            workDate: '2026-11-03',
            weekStart: '2026-11-02',
            shiftName: 'Malam',
            clockInAt: '2026-11-03T13:00:00.000Z',
            proposedClockOutAt: '2026-11-04T01:00:00.000Z',
            actualHours: 12,
            regularHours: 8,
            overtimeHours: 4,
            earnings: 150000,
            eligible: true,
            warning: 'Tarif harian 0, upah tetap Rp0',
        },
        {
            id: 'r3',
            employeeId: 'e3',
            employeeName: 'Dewi Contoh',
            employeeCode: 'E003',
            workDate: '2026-11-08',
            weekStart: '2026-11-02',
            shiftName: 'Pagi',
            clockInAt: '2026-11-08T09:00:00.000Z',
            proposedClockOutAt: null,
            actualHours: null,
            regularHours: 0,
            overtimeHours: 0,
            earnings: 0,
            eligible: false,
            reason: 'Jam masuk melewati akhir shift',
        },
    ],
    totals: { eligibleCount: 2, ineligibleCount: 1, earnings: 250000 },
    byEmployee: [
        { employeeId: 'e1', employeeName: 'Budi Contoh', eligibleCount: 1, earnings: 100000 },
        { employeeId: 'e2', employeeName: 'Siti Contoh', eligibleCount: 1, earnings: 150000 },
    ],
    byWeek: [
        { weekStart: '2026-11-02', eligibleCount: 1, earnings: 150000 },
        { weekStart: '2026-11-09', eligibleCount: 1, earnings: 100000 },
    ],
};

export const APPLY_RESULT: ClosureApplyResult = {
    batchId: 'batch-1',
    closedCount: 2,
    skippedCount: 0,
    earningsAdded: 250000,
};
