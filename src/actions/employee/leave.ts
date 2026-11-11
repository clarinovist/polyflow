'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/core/tenant';
import { prisma as db } from '@/lib/core/prisma';
import { requireEmployeeSession } from '@/lib/auth/employee-session';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import {
    MyLeaveService,
    parseMyLeaveInput,
    type MyLeaveInput,
} from '@/services/hrd/leave-self-service';

/**
 * Self-service izin: employeeId selalu dari session, input client
 * di-whitelist per field. Audit: baris LeaveRequest adalah catatannya
 * (karyawan tidak punya userId User untuk logActivity).
 */

const DEFAULT_LIST_LIMIT = 10;
const MIN_LIST_LIMIT = 1;
const MAX_LIST_LIMIT = 50;
const CREATE_FAILED_MESSAGE =
    'Gagal mengirim pengajuan izin. Silakan coba lagi.';

function clampLimit(limit: number | undefined): number {
    if (limit === undefined || !Number.isFinite(limit)) {
        return DEFAULT_LIST_LIMIT;
    }
    return Math.min(
        MAX_LIST_LIMIT,
        Math.max(MIN_LIST_LIMIT, Math.floor(limit)),
    );
}

function toUserMessage(error: unknown): string {
    if (error instanceof BusinessRuleError || error instanceof NotFoundError) {
        return error.message;
    }
    return CREATE_FAILED_MESSAGE;
}

export const createMyLeaveRequest = withTenant(
    async function createMyLeaveRequest(input: MyLeaveInput) {
        try {
            const session = await requireEmployeeSession();
            if (!session) return { success: false, error: 'Unauthorized' };
            const safeInput = parseMyLeaveInput(input);
            const data = await MyLeaveService.create(
                db,
                session.employeeId,
                safeInput,
            );
            revalidatePath('/my/absensi');
            return { success: true, data };
        } catch (e) {
            return { success: false, error: toUserMessage(e) };
        }
    },
);

export const listMyLeaveRequests = withTenant(
    async function listMyLeaveRequests(limit?: number) {
        try {
            const session = await requireEmployeeSession();
            if (!session) return { success: false, error: 'Unauthorized' };
            const data = await MyLeaveService.listMine(
                db,
                session.employeeId,
                clampLimit(limit),
            );
            return { success: true, data };
        } catch {
            return { success: false, error: 'Gagal memuat pengajuan izin' };
        }
    },
);
