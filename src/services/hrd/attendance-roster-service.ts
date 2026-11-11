import type { PrismaClient } from '@prisma/client';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SUNDAY_UTC_DAY = 0;

export interface NoRecordEmployee {
    employeeId: string;
    name: string;
    code: string;
    assignedShift: { id: string; name: string } | null;
}

export interface NoRecordRoster {
    isNonWorkingDay: boolean;
    employees: NoRecordEmployee[];
}

/**
 * Parse `YYYY-MM-DD` ke tanggal-saja (UTC midnight). Null bila bentuk atau
 * kalendernya tidak valid (mis. 2026-02-30), supaya aksi bisa menolak input.
 */
export function parseRosterDate(value: string): Date | null {
    if (!DATE_ONLY_PATTERN.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10) === value ? date : null;
}

type ShiftAssignmentRow = {
    employeeId: string;
    effectiveFrom: Date;
    workShift: { id: string; name: string };
};

/** Shift penugasan terbaru (effectiveFrom terbesar) per karyawan. */
function latestShiftByEmployee(
    rows: ShiftAssignmentRow[],
): Map<string, { id: string; name: string }> {
    const latest = new Map<string, ShiftAssignmentRow>();
    for (const row of rows) {
        const current = latest.get(row.employeeId);
        if (!current || row.effectiveFrom > current.effectiveFrom) {
            latest.set(row.employeeId, row);
        }
    }
    return new Map(
        Array.from(latest, ([employeeId, row]) => [
            employeeId,
            { id: row.workShift.id, name: row.workShift.name },
        ]),
    );
}

export const AttendanceRosterService = {
    /**
     * Karyawan ACTIVE yang belum punya record absensi pada `workDate`.
     * Hanya Senin–Sabtu (Minggu = hari libur, tanpa query), dan hanya yang
     * `joinDate`-nya sudah tiba. Shift default memakai semantik
     * EmployeeShiftAssignment yang ada (efektif pada tanggal itu, shift ACTIVE,
     * effectiveFrom terbaru) lewat SATU query untuk semua karyawan.
     */
    async listNoRecord(
        db: PrismaClient,
        workDate: Date,
    ): Promise<NoRecordRoster> {
        if (workDate.getUTCDay() === SUNDAY_UTC_DAY) {
            return { isNonWorkingDay: true, employees: [] };
        }

        const employees = await db.employee.findMany({
            where: {
                status: 'ACTIVE',
                OR: [{ joinDate: null }, { joinDate: { lte: workDate } }],
                attendanceRecords: { none: { workDate } },
            },
            select: { id: true, name: true, code: true },
            orderBy: { code: 'asc' },
        });
        if (employees.length === 0) {
            return { isNonWorkingDay: false, employees: [] };
        }

        const assignments = await db.employeeShiftAssignment.findMany({
            where: {
                employeeId: { in: employees.map((e) => e.id) },
                effectiveFrom: { lte: workDate },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: workDate } }],
                workShift: { status: 'ACTIVE' },
            },
            select: {
                employeeId: true,
                effectiveFrom: true,
                workShift: { select: { id: true, name: true } },
            },
            orderBy: { effectiveFrom: 'desc' },
        });
        const shiftByEmployee = latestShiftByEmployee(assignments);

        return {
            isNonWorkingDay: false,
            employees: employees.map((e) => ({
                employeeId: e.id,
                name: e.name,
                code: e.code,
                assignedShift: shiftByEmployee.get(e.id) ?? null,
            })),
        };
    },
};
