import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
    AttendanceRosterService,
    parseRosterDate,
} from '../attendance-roster-service';

// Hanya batas Prisma yang di-stub; semua data fiktif.
const MONDAY = new Date('2026-11-09T00:00:00.000Z');
const SATURDAY = new Date('2026-11-14T00:00:00.000Z');
const SUNDAY = new Date('2026-11-15T00:00:00.000Z');

type EmployeeRow = { id: string; name: string; code: string };
type AssignmentRow = {
    employeeId: string;
    effectiveFrom: Date;
    workShift: { id: string; name: string; status: string };
};

const shift = (id: string, name: string) => ({
    id,
    name,
    status: 'ACTIVE',
});

function createDb(employees: EmployeeRow[], assignments: AssignmentRow[] = []) {
    const employeeFindMany = vi.fn().mockResolvedValue(employees);
    const assignmentFindMany = vi.fn().mockResolvedValue(assignments);
    const db = {
        employee: { findMany: employeeFindMany },
        employeeShiftAssignment: { findMany: assignmentFindMany },
    } as unknown as PrismaClient;
    return { db, employeeFindMany, assignmentFindMany };
}

const EMPLOYEES: EmployeeRow[] = [
    { id: 'e-1', name: 'Alfa Contoh', code: 'E001' },
    { id: 'e-2', name: 'Beta Contoh', code: 'E002' },
    { id: 'e-3', name: 'Gamma Contoh', code: 'E003' },
];

describe('AttendanceRosterService.listNoRecord', () => {
    it('returns an empty non-working day on Sunday without touching the database', async () => {
        const { db, employeeFindMany, assignmentFindMany } =
            createDb(EMPLOYEES);

        const result = await AttendanceRosterService.listNoRecord(db, SUNDAY);

        expect(result).toEqual({ isNonWorkingDay: true, employees: [] });
        expect(employeeFindMany).not.toHaveBeenCalled();
        expect(assignmentFindMany).not.toHaveBeenCalled();
    });

    it.each([
        ['Monday', MONDAY],
        ['Saturday', SATURDAY],
    ])('treats %s as a working day', async (_name, date) => {
        const { db } = createDb(EMPLOYEES.slice(0, 1));

        const result = await AttendanceRosterService.listNoRecord(db, date);

        expect(result.isNonWorkingDay).toBe(false);
        expect(result.employees).toHaveLength(1);
    });

    it('queries only ACTIVE employees without a record that day and already joined', async () => {
        const { db, employeeFindMany } = createDb([]);

        await AttendanceRosterService.listNoRecord(db, MONDAY);

        expect(employeeFindMany).toHaveBeenCalledExactlyOnceWith({
            where: {
                status: 'ACTIVE',
                OR: [{ joinDate: null }, { joinDate: { lte: MONDAY } }],
                attendanceRecords: { none: { workDate: MONDAY } },
            },
            select: { id: true, name: true, code: true },
            orderBy: { code: 'asc' },
        });
    });

    it('skips the assignment query when nobody is missing a record', async () => {
        const { db, assignmentFindMany } = createDb([]);

        const result = await AttendanceRosterService.listNoRecord(db, MONDAY);

        expect(result).toEqual({ isNonWorkingDay: false, employees: [] });
        expect(assignmentFindMany).not.toHaveBeenCalled();
    });

    it('uses one assignment query for all employees (no N+1)', async () => {
        const { db, employeeFindMany, assignmentFindMany } =
            createDb(EMPLOYEES);

        await AttendanceRosterService.listNoRecord(db, MONDAY);

        expect(employeeFindMany).toHaveBeenCalledTimes(1);
        expect(assignmentFindMany).toHaveBeenCalledTimes(1);
        expect(assignmentFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    employeeId: { in: ['e-1', 'e-2', 'e-3'] },
                    effectiveFrom: { lte: MONDAY },
                    OR: [{ effectiveTo: null }, { effectiveTo: { gte: MONDAY } }],
                    workShift: { status: 'ACTIVE' },
                },
            }),
        );
    });

    it('keeps the same query count with one employee and with three', async () => {
        const one = createDb(EMPLOYEES.slice(0, 1));
        const three = createDb(EMPLOYEES);

        await AttendanceRosterService.listNoRecord(one.db, MONDAY);
        await AttendanceRosterService.listNoRecord(three.db, MONDAY);

        expect(one.assignmentFindMany.mock.calls).toHaveLength(
            three.assignmentFindMany.mock.calls.length,
        );
    });

    it('assigns the most recent effectiveFrom shift and null when none exists', async () => {
        const { db } = createDb(EMPLOYEES, [
            {
                employeeId: 'e-1',
                effectiveFrom: new Date('2026-01-01'),
                workShift: shift('s-old', 'Shift lama'),
            },
            {
                employeeId: 'e-1',
                effectiveFrom: new Date('2026-10-01'),
                workShift: shift('s-new', 'Shift baru'),
            },
            {
                employeeId: 'e-2',
                effectiveFrom: new Date('2026-03-01'),
                workShift: shift('s-b', 'Shift B'),
            },
        ]);

        const result = await AttendanceRosterService.listNoRecord(db, MONDAY);

        expect(result.employees).toEqual([
            {
                employeeId: 'e-1',
                name: 'Alfa Contoh',
                code: 'E001',
                assignedShift: { id: 's-new', name: 'Shift baru' },
            },
            {
                employeeId: 'e-2',
                name: 'Beta Contoh',
                code: 'E002',
                assignedShift: { id: 's-b', name: 'Shift B' },
            },
            {
                employeeId: 'e-3',
                name: 'Gamma Contoh',
                code: 'E003',
                assignedShift: null,
            },
        ]);
    });

    it('propagates database failures instead of returning an empty roster', async () => {
        const db = {
            employee: {
                findMany: vi.fn().mockRejectedValue(new Error('db down')),
            },
        } as unknown as PrismaClient;

        await expect(
            AttendanceRosterService.listNoRecord(db, MONDAY),
        ).rejects.toThrow('db down');
    });
});

describe('parseRosterDate', () => {
    it('parses a valid YYYY-MM-DD string to UTC midnight', () => {
        expect(parseRosterDate('2026-11-10')?.toISOString()).toBe(
            '2026-11-10T00:00:00.000Z',
        );
    });

    it.each(['', 'garbage', '2026-13-01', '2026-02-30', '2026-11-10T10:00', '10-11-2026'])(
        'rejects %j',
        (value) => {
            expect(parseRosterDate(value)).toBeNull();
        },
    );
});
