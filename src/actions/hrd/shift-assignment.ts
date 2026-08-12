'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireHrdApprover, requireHrdFinance } from '@/lib/auth/hrd-access';
import { logActivity } from '@/lib/tools/audit';
import { revalidatePath } from 'next/cache';
import {
    EmployeeShiftAssignmentService,
    type CreateAssignmentInput,
} from '@/services/hrd/employee-shift-assignment-service';

export const listShiftAssignments = withTenant(
    async function listShiftAssignments(employeeId: string) {
        return safeAction(async () => {
            await requireHrdFinance();
            return EmployeeShiftAssignmentService.listByEmployee(
                prisma,
                employeeId,
            );
        });
    },
);

export const createShiftAssignment = withTenant(
    async function createShiftAssignment(input: CreateAssignmentInput) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            const result = await EmployeeShiftAssignmentService.create(
                prisma,
                input,
            );
            await logActivity({
                userId: session.user.id,
                action: 'SHIFT_ASSIGNMENT_CREATED',
                entityType: 'EmployeeShiftAssignment',
                entityId: result.id,
                details: `Tetapkan shift ${result.shiftName} untuk ${result.employeeCode} — ${result.employeeName} (mulai ${result.effectiveFrom.toISOString().slice(0, 10)})`,
            });
            revalidatePath(`/dashboard/employees/${result.employeeId}/edit`);
            return result;
        });
    },
);

export const endShiftAssignment = withTenant(async function endShiftAssignment(
    assignmentId: string,
    effectiveTo: Date,
) {
    return safeAction(async () => {
        const session = await requireHrdApprover();
        const result = await EmployeeShiftAssignmentService.endAssignment(
            prisma,
            assignmentId,
            effectiveTo,
        );
        await logActivity({
            userId: session.user.id,
            action: 'SHIFT_ASSIGNMENT_ENDED',
            entityType: 'EmployeeShiftAssignment',
            entityId: result.id,
            details: `Akhiri shift ${result.shiftName} untuk ${result.employeeCode} — ${result.employeeName} (berakhir ${result.effectiveTo?.toISOString().slice(0, 10) ?? ''})`,
        });
        revalidatePath(`/dashboard/employees/${result.employeeId}/edit`);
        return result;
    });
});
