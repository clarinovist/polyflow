import type {
    AttendanceRecord,
    MonthlySummary,
    WeeklySummary,
} from '../attendance-recap-types';

/** Fixture bersama untuk tes komponen rekap absensi (tenant/nama fiktif). */
export const RECORD: AttendanceRecord = {
    id: 'r1',
    employeeId: 'e1',
    workShiftId: 's1',
    employeeCode: 'E001',
    employeeName: 'Budi Contoh',
    shiftName: 'Pagi',
    plannedHours: 8,
    clockInAt: '2026-11-10T00:00:00.000Z',
    clockOutAt: null,
    actualHours: null,
    overtimeHours: 0,
    isOvertimeShift: false,
    status: 'PRESENT',
    source: 'KIOSK',
    clockInPhotoUrl: '/api/images/acme/attendance/e1/a.jpg',
    isLate: false,
    isOutsideRadius: false,
    hasValidSelfie: true,
};

export const MONTHLY_ROWS: MonthlySummary[] = [
    {
        employeeId: 'e1',
        employeeCode: 'E001',
        employeeName: 'Budi Contoh',
        daysPresent: 20,
        daysAbsent: 2,
        daysOnLeave: 1,
        totalActualHours: 160.25,
        totalOvertimeHours: 4.5,
        multiShiftDays: 3,
    },
    {
        employeeId: 'e2',
        employeeCode: 'E002',
        employeeName: 'Siti Contoh',
        daysPresent: 22,
        daysAbsent: 0,
        daysOnLeave: 0,
        totalActualHours: 170,
        totalOvertimeHours: 0,
        multiShiftDays: 0,
    },
];

export const WEEKLY_ROWS: WeeklySummary[] = [
    {
        employeeId: 'e1',
        employeeCode: 'E001',
        employeeName: 'Budi Contoh',
        daysPresent: 5,
        totalActualHours: 40,
        totalOvertimeHours: 2,
        totalDailyEarnings: 500000,
        totalOvertimeEarnings: 50000,
        totalEarnings: 550000,
    },
    {
        employeeId: 'e2',
        employeeCode: 'E002',
        employeeName: 'Siti Contoh',
        daysPresent: 4,
        totalActualHours: 32,
        totalOvertimeHours: 0,
        totalDailyEarnings: 400000,
        totalOvertimeEarnings: 0,
        totalEarnings: 400000,
    },
];
