'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireHrdApprover, requireHrdFinance } from '@/lib/auth/hrd-access';
import { logActivity } from '@/lib/tools/audit';
import { DisciplinaryService, LeaveService, type DisciplinaryInput, type LeaveRequestInput } from '@/services/hrd/disciplinary-leave-service';

// ─── Disciplinary Actions ───

export const listDisciplinaryActions = withTenant(
    async function listDisciplinaryActions(employeeId?: string) {
        return safeAction(async () => {
            await requireHrdFinance();
            return DisciplinaryService.list(prisma, employeeId);
        });
    },
);

export const getDisciplinaryRecap = withTenant(
    async function getDisciplinaryRecap(year?: number, month?: number) {
        return safeAction(async () => {
            await requireHrdFinance();
            return DisciplinaryService.getRecap(prisma, year, month);
        });
    },
);

export const createDisciplinaryAction = withTenant(
    async function createDisciplinaryAction(data: DisciplinaryInput) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            const withIssuer = { ...data, issuedById: data.issuedById ?? session.user.id };
            const result = await DisciplinaryService.create(prisma, withIssuer);
            await logActivity({
                userId: session.user.id,
                action: 'DISCIPLINARY_ACTION_CREATED',
                entityType: 'DisciplinaryAction',
                entityId: result.id,
                details: `Created ${result.type} for ${result.employee.code} — ${result.employee.name} (effective ${result.effectiveDate.toISOString().slice(0, 10)})`,
            });
            return result;
        });
    },
);

export const deleteDisciplinaryAction = withTenant(
    async function deleteDisciplinaryAction(id: string) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            await DisciplinaryService.remove(prisma, id);
            await logActivity({
                userId: session.user.id,
                action: 'DISCIPLINARY_ACTION_DELETED',
                entityType: 'DisciplinaryAction',
                entityId: id,
                details: `Deleted disciplinary action ${id}`,
            });
            return null;
        });
    },
);

// ─── Leave Requests ───

export const listLeaveRequests = withTenant(
    async function listLeaveRequests(filters?: { employeeId?: string; status?: 'PENDING' | 'APPROVED' | 'REJECTED' }) {
        return safeAction(async () => {
            await requireHrdFinance();
            return LeaveService.list(prisma, filters);
        });
    },
);

export const getLeaveRecap = withTenant(
    async function getLeaveRecap(year: number, month: number) {
        return safeAction(async () => {
            await requireHrdFinance();
            return LeaveService.getRecap(prisma, year, month);
        });
    },
);

export const createLeaveRequest = withTenant(
    async function createLeaveRequest(data: LeaveRequestInput) {
        return safeAction(async () => {
            await requireHrdFinance(); // admin or finance can create pengajuan
            return LeaveService.create(prisma, data);
        });
    },
);

export const approveLeaveRequest = withTenant(
    async function approveLeaveRequest(id: string, reviewNotes?: string) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            await LeaveService.approve(prisma, id, reviewNotes, session.user.id);
            await logActivity({
                userId: session.user.id,
                action: 'LEAVE_APPROVED',
                entityType: 'LeaveRequest',
                entityId: id,
                details: reviewNotes ? `Approved leave request: ${reviewNotes}` : 'Approved leave request',
            });
            return null;
        });
    },
);

export const rejectLeaveRequest = withTenant(
    async function rejectLeaveRequest(id: string, reviewNotes?: string) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            await LeaveService.reject(prisma, id, reviewNotes, session.user.id);
            await logActivity({
                userId: session.user.id,
                action: 'LEAVE_REJECTED',
                entityType: 'LeaveRequest',
                entityId: id,
                details: reviewNotes ? `Rejected leave request: ${reviewNotes}` : 'Rejected leave request',
            });
            return null;
        });
    },
);
