import { PrismaClient } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';

export interface CreateAssignmentInput {
    employeeId: string;
    workShiftId: string;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
}

export interface AssignmentResult {
    id: string;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    workShiftId: string;
    shiftName: string;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    createdAt: Date;
}

const assignmentInclude = {
    employee: { select: { name: true, code: true } },
    workShift: { select: { name: true } },
} as const;

type AssignmentWithRelations = {
    id: string;
    employeeId: string;
    workShiftId: string;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    createdAt: Date;
    employee: { name: string; code: string };
    workShift: { name: string };
};

function toResult(a: AssignmentWithRelations): AssignmentResult {
    return {
        id: a.id,
        employeeId: a.employeeId,
        employeeName: a.employee.name,
        employeeCode: a.employee.code,
        workShiftId: a.workShiftId,
        shiftName: a.workShift.name,
        effectiveFrom: a.effectiveFrom,
        effectiveTo: a.effectiveTo,
        createdAt: a.createdAt,
    };
}

export const EmployeeShiftAssignmentService = {
    /**
     * Create a new shift assignment for an employee.
     * Validates: employee exists, shift exists and active, no overlapping assignments.
     */
    async create(
        db: PrismaClient,
        input: CreateAssignmentInput,
    ): Promise<AssignmentResult> {
        const employee = await db.employee.findUnique({
            where: { id: input.employeeId },
            select: { id: true, name: true, code: true, status: true },
        });
        if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');

        const shift = await db.workShift.findUnique({
            where: { id: input.workShiftId },
            select: { id: true, name: true, status: true },
        });
        if (!shift) throw new NotFoundError('Shift tidak ditemukan');
        if (shift.status !== 'ACTIVE')
            throw new BusinessRuleError('Shift tidak aktif');

        if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
            throw new BusinessRuleError(
                'Tanggal akhir harus setelah atau sama dengan tanggal mulai',
            );
        }

        // Check for overlapping assignments
        const overlap = await db.employeeShiftAssignment.findFirst({
            where: {
                employeeId: input.employeeId,
                // New assignment's range overlaps with existing if:
                // existing.effectiveFrom <= new.effectiveTo AND
                // (existing.effectiveTo IS NULL OR existing.effectiveTo >= new.effectiveFrom)
                effectiveFrom: input.effectiveTo
                    ? { lte: input.effectiveTo }
                    : undefined,
                OR: [
                    { effectiveTo: null },
                    { effectiveTo: { gte: input.effectiveFrom } },
                ],
            },
        });

        if (overlap) {
            throw new BusinessRuleError(
                'Karyawan sudah memiliki assignment shift yang overlap pada periode ini',
            );
        }

        const assignment = await db.employeeShiftAssignment.create({
            data: {
                employeeId: input.employeeId,
                workShiftId: input.workShiftId,
                effectiveFrom: input.effectiveFrom,
                effectiveTo: input.effectiveTo ?? null,
            },
            include: assignmentInclude,
        });

        return toResult(assignment as unknown as AssignmentWithRelations);
    },

    /**
     * End an assignment by setting effectiveTo.
     */
    async endAssignment(
        db: PrismaClient,
        assignmentId: string,
        effectiveTo: Date,
    ): Promise<AssignmentResult> {
        const existing = await db.employeeShiftAssignment.findUnique({
            where: { id: assignmentId },
            include: assignmentInclude,
        });
        if (!existing) throw new NotFoundError('Assignment tidak ditemukan');

        if (effectiveTo < existing.effectiveFrom) {
            throw new BusinessRuleError(
                'Tanggal akhir harus setelah atau sama dengan tanggal mulai',
            );
        }

        const updated = await db.employeeShiftAssignment.update({
            where: { id: assignmentId },
            data: { effectiveTo },
            include: assignmentInclude,
        });

        return toResult(updated as unknown as AssignmentWithRelations);
    },

    /**
     * Delete an assignment (only if no attendance records reference it).
     */
    async remove(
        db: PrismaClient,
        assignmentId: string,
    ): Promise<void> {
        const existing = await db.employeeShiftAssignment.findUnique({
            where: { id: assignmentId },
        });
        if (!existing) throw new NotFoundError('Assignment tidak ditemukan');

        // Check if any attendance records use this shift for this employee in the assignment period
        const recordCount = await db.attendanceRecord.count({
            where: {
                employeeId: existing.employeeId,
                workShiftId: existing.workShiftId,
                workDate: { gte: existing.effectiveFrom },
            },
        });

        if (recordCount > 0) {
            throw new BusinessRuleError(
                'Tidak dapat menghapus assignment yang sudah memiliki catatan absensi. Gunakan akhiri assignment.',
            );
        }

        await db.employeeShiftAssignment.delete({
            where: { id: assignmentId },
        });
    },

    /**
     * List all assignments for an employee.
     */
    async listByEmployee(
        db: PrismaClient,
        employeeId: string,
    ): Promise<AssignmentResult[]> {
        const assignments = await db.employeeShiftAssignment.findMany({
            where: { employeeId },
            include: assignmentInclude,
            orderBy: { effectiveFrom: 'desc' },
        });

        return assignments.map((a) =>
            toResult(a as unknown as AssignmentWithRelations),
        );
    },

    /**
     * Get the active assignment for an employee on a given date.
     */
    async getActiveForDate(
        db: PrismaClient,
        employeeId: string,
        date: Date,
    ): Promise<AssignmentResult | null> {
        const assignment = await db.employeeShiftAssignment.findFirst({
            where: {
                employeeId,
                effectiveFrom: { lte: date },
                OR: [
                    { effectiveTo: null },
                    { effectiveTo: { gte: date } },
                ],
            },
            include: assignmentInclude,
            orderBy: { effectiveFrom: 'desc' },
        });

        if (!assignment) return null;
        return toResult(assignment as unknown as AssignmentWithRelations);
    },
};
