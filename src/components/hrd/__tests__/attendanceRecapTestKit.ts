import { vi } from 'vitest';

/** Fixture dan setup bersama untuk tes karakterisasi AttendanceRecap (nama fiktif). */

export const base = {
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
export const records = [
    { ...base, id: 'r1' },
    {
        ...base,
        id: 'r2',
        employeeId: 'e2',
        employeeCode: 'E002',
        employeeName: 'Siti Contoh',
        isLate: true,
    },
    {
        ...base,
        id: 'r3',
        employeeId: 'e3',
        employeeCode: 'E003',
        employeeName: 'Andi Contoh',
        status: 'ABSENT',
        clockInPhotoUrl: null,
        hasValidSelfie: false,
    },
];
export const shifts = [
    { id: 's1', name: 'Pagi', startTime: '07:00', endTime: '15:00', status: 'ACTIVE' },
    { id: 's2', name: 'Malam', startTime: '19:00', endTime: '03:00', status: 'ACTIVE' },
    { id: 's3', name: 'Lama', startTime: '01:00', endTime: '02:00', status: 'INACTIVE' },
];
export const props = {
    records,
    summary: null,
    shifts,
    currentDate: '2026-11-10',
    overtimeOnly: false,
};

export const monthlyRows = [
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
export const weeklyRows = [
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


/** Radix Select/Dropdown membutuhkan API DOM yang tidak ada di jsdom. */
export function installRadixPolyfills(): void {
    const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.scrollIntoView = vi.fn();
    proto.hasPointerCapture = vi.fn(() => false);
    proto.releasePointerCapture = vi.fn();
    proto.setPointerCapture = vi.fn();
}
