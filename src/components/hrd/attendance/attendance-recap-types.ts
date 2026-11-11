/** Tipe data bersama untuk tampilan rekap absensi (harian/mingguan/bulanan). */

export interface AttendanceRecord {
    id: string;
    employeeId: string;
    workShiftId: string;
    employeeCode: string;
    employeeName: string;
    shiftName: string;
    plannedHours: number;
    clockInAt: Date | string | null;
    clockOutAt: Date | string | null;
    actualHours: number | null;
    overtimeHours: number;
    isOvertimeShift: boolean;
    status: string;
    source: string;
    clockInPhotoUrl?: string | null;
    clockOutPhotoUrl?: string | null;
    clockInLatitude?: number | null;
    clockInLongitude?: number | null;
    clockInDistance?: number | null;
    clockOutDistance?: number | null;
    isLate?: boolean;
    isOutsideRadius?: boolean;
    hasValidSelfie?: boolean;
}

export interface DailySummary {
    totalEmployees: number;
    totalRecords: number;
    multiShiftCount: number;
    totalActualHours: number;
    totalOvertimeHours: number;
}

export interface WorkShift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    status?: string;
}

export type ViewMode = 'daily' | 'weekly' | 'monthly';

export interface MonthlySummary {
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    daysPresent: number;
    daysAbsent: number;
    daysOnLeave: number;
    totalActualHours: number;
    totalOvertimeHours: number;
    multiShiftDays: number;
}

export interface WeeklySummary {
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    daysPresent: number;
    totalActualHours: number;
    totalOvertimeHours: number;
    totalDailyEarnings: number;
    totalOvertimeEarnings: number;
    totalEarnings: number;
}

export interface PhotoPreview {
    url: string;
    title: string;
}
