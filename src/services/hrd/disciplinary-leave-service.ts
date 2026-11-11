/**
 * HRD Services — Disciplinary Actions & Leave Requests (Fase 4, §10 + §14).
 * Pure functions over a Prisma client (no 'use server').
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { assertSafeDocumentUrl } from '@/lib/hrd/document-url';
import { getEffectivePlannedHours } from './shift-window';

// ── Disciplinary Actions ──

export interface DisciplinaryInput {
    employeeId: string;
    type: 'VERBAL_WARNING' | 'SP1' | 'SP2' | 'SP3' | 'SUSPENSION' | 'OTHER';
    reason: string;
    effectiveDate: Date;
    expiryDate?: Date;
    documentUrl?: string;
    issuedById?: string;
    notes?: string;
}

export const DisciplinaryService = {
    async list(db: PrismaClient, employeeId?: string) {
        return db.disciplinaryAction.findMany({
            where: employeeId ? { employeeId } : undefined,
            include: {
                employee: { select: { id: true, name: true, code: true } },
                issuedBy: { select: { id: true, name: true } },
            },
            orderBy: { effectiveDate: 'desc' },
        });
    },

    /** Count by type + active (not expired) for HRD rekap. */
    async getRecap(db: PrismaClient, year?: number, month?: number) {
        const where: Record<string, unknown> = {};
        if (year != null && month != null) {
            const monthStart = new Date(Date.UTC(year, month - 1, 1));
            const monthEnd = new Date(
                Date.UTC(year, month, 0, 23, 59, 59, 999),
            );
            where.effectiveDate = { gte: monthStart, lte: monthEnd };
        }
        const rows = await db.disciplinaryAction.findMany({
            where: where as never,
            select: {
                type: true,
                expiryDate: true,
            },
        });
        const now = new Date();
        const byType = new Map<string, number>();
        let activeCount = 0;
        for (const r of rows) {
            byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
            if (!r.expiryDate || r.expiryDate >= now) activeCount += 1;
        }
        return {
            total: rows.length,
            activeCount,
            byType: Array.from(byType.entries()).map(([type, count]) => ({
                type,
                count,
            })),
        };
    },

    async create(db: PrismaClient, data: DisciplinaryInput) {
        if (!data.reason.trim())
            throw new BusinessRuleError('Alasan sanksi wajib diisi');
        assertSafeDocumentUrl(data.documentUrl);
        const employee = await db.employee.findUnique({
            where: { id: data.employeeId },
            select: { id: true, name: true, code: true },
        });
        if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');
        if (data.expiryDate && data.expiryDate < data.effectiveDate) {
            throw new BusinessRuleError(
                'Tanggal hangus tidak boleh sebelum tanggal berlaku',
            );
        }
        return db.disciplinaryAction.create({
            data: {
                employeeId: data.employeeId,
                type: data.type,
                reason: data.reason.trim(),
                effectiveDate: data.effectiveDate,
                expiryDate: data.expiryDate ?? null,
                documentUrl: data.documentUrl ?? null,
                issuedById: data.issuedById ?? null,
                notes: data.notes?.trim() || null,
            },
            include: {
                employee: { select: { id: true, name: true, code: true } },
            },
        });
    },

    async remove(db: PrismaClient, id: string) {
        return db.disciplinaryAction.delete({ where: { id } });
    },

    /** On-the-fly "is active" per §10.2 — no cron needed. */
    isActive(action: { expiryDate: Date | null }): boolean {
        return !action.expiryDate || action.expiryDate >= new Date();
    },
};

// ── Leave Requests ──

export interface LeaveRequestInput {
    employeeId: string;
    type: 'ANNUAL' | 'SICK' | 'PERMISSION' | 'MATERNITY' | 'UNPAID' | 'OTHER';
    startDate: Date;
    endDate: Date;
    reason?: string;
    documentUrl?: string;
}

function eachUtcDateInclusive(start: Date, end: Date): Date[] {
    const dates: Date[] = [];
    const d = new Date(
        Date.UTC(
            start.getUTCFullYear(),
            start.getUTCMonth(),
            start.getUTCDate(),
        ),
    );
    const last = new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
    );
    while (d <= last) {
        dates.push(new Date(d));
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return dates;
}

/** Inclusive calendar days between two dates (UTC day bounds). */
export function leaveDayCount(start: Date, end: Date): number {
    const a = Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate(),
    );
    const b = Date.UTC(
        end.getUTCFullYear(),
        end.getUTCMonth(),
        end.getUTCDate(),
    );
    if (b < a) return 0;
    return Math.floor((b - a) / 86_400_000) + 1;
}

/** Upper bound on days synced per leave request (guards runaway loops). */
export const MAX_LEAVE_SYNC_DAYS = 366;

type LeaveTx = Prisma.TransactionClient;
type LeaveReviewStatus = 'APPROVED' | 'REJECTED';
type LeaveRow = NonNullable<
    Awaited<ReturnType<LeaveTx['leaveRequest']['findUnique']>>
>;
interface ShiftChoice {
    id: string;
    plannedHours: number;
}

async function findRequestOrThrow(
    tx: LeaveTx,
    id: string,
): Promise<LeaveRow> {
    const req = await tx.leaveRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundError('Pengajuan cuti tidak ditemukan');
    return req;
}

function leaveDatesOrThrow(req: LeaveRow): Date[] {
    if (leaveDayCount(req.startDate, req.endDate) > MAX_LEAVE_SYNC_DAYS) {
        throw new BusinessRuleError(
            `Rentang izin terlalu panjang (maksimal ${MAX_LEAVE_SYNC_DAYS} hari)`,
        );
    }
    return eachUtcDateInclusive(req.startDate, req.endDate);
}

/** Atomic PENDING -> reviewed transition; only one caller can win. */
async function claimPendingRequest(
    tx: LeaveTx,
    req: LeaveRow,
    status: LeaveReviewStatus,
    reviewNotes: string | undefined,
    reviewedById: string,
): Promise<LeaveRow> {
    const review = {
        status,
        reviewedAt: new Date(),
        reviewedById,
        reviewNotes: reviewNotes?.trim() || null,
    };
    const claimed = await tx.leaveRequest.updateMany({
        where: { id: req.id, status: 'PENDING' },
        data: review,
    });
    if (claimed.count !== 1) {
        throw new BusinessRuleError('Pengajuan sudah diproses');
    }
    return { ...req, ...review };
}

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

type AssignmentRow = {
    effectiveFrom: Date;
    effectiveTo: Date | null;
    workShift: {
        id: string;
        status: string;
        plannedHours: unknown;
        startTime: string;
        endTime: string;
    };
};

function toShiftChoice(shift: {
    id: string;
    plannedHours: unknown;
    startTime: string;
    endTime: string;
}): ShiftChoice {
    const planned = shift.plannedHours == null ? null : Number(shift.plannedHours);
    return {
        id: shift.id,
        plannedHours: getEffectivePlannedHours(
            planned,
            shift.startTime,
            shift.endTime,
        ),
    };
}

/** Same semantics as EmployeeShiftAssignmentService.getActiveForDate, in memory. */
function assignedShiftFor(
    assignments: AssignmentRow[],
    date: Date,
): ShiftChoice | null {
    const t = date.getTime();
    const match = assignments
        .filter(
            (a) =>
                a.effectiveFrom.getTime() <= t &&
                (a.effectiveTo === null || a.effectiveTo.getTime() >= t) &&
                a.workShift.status === 'ACTIVE',
        )
        .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
    return match ? toShiftChoice(match.workShift) : null;
}

async function loadAssignments(
    tx: LeaveTx,
    employeeId: string,
    first: Date,
    last: Date,
): Promise<AssignmentRow[]> {
    return tx.employeeShiftAssignment.findMany({
        where: {
            employeeId,
            effectiveFrom: { lte: last },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: first } }],
        },
        select: {
            effectiveFrom: true,
            effectiveTo: true,
            workShift: {
                select: {
                    id: true,
                    status: true,
                    plannedHours: true,
                    startTime: true,
                    endTime: true,
                },
            },
        },
    });
}

async function loadDefaultShift(tx: LeaveTx): Promise<ShiftChoice | null> {
    const shift = await tx.workShift.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: {
            id: true,
            plannedHours: true,
            startTime: true,
            endTime: true,
        },
    });
    return shift ? toShiftChoice(shift) : null;
}

function buildLeaveRecord(
    req: LeaveRow,
    workDate: Date,
    shift: ShiftChoice,
): Prisma.AttendanceRecordCreateManyInput {
    return {
        employeeId: req.employeeId,
        workDate,
        workShiftId: shift.id,
        status: 'ON_LEAVE',
        source: 'MANUAL',
        notes: `Auto from leave request ${req.id}`,
        plannedHours: shift.plannedHours,
        regularHours: 0,
        overtimeHours: 0,
        dailyEarnings: 0,
        overtimeEarnings: 0,
        totalEarnings: 0,
    };
}

/**
 * Sync attendance for an approved leave. Returns how many existing records
 * were preserved because they already carry a clock-in.
 */
async function syncLeaveAttendance(
    tx: LeaveTx,
    req: LeaveRow,
    dates: Date[],
): Promise<number> {
    if (dates.length === 0) return 0;
    const first = dates[0];
    const last = dates[dates.length - 1];
    const range = { gte: first, lte: last };

    const existing = await tx.attendanceRecord.findMany({
        where: { employeeId: req.employeeId, workDate: range },
        select: { workDate: true, clockInAt: true },
    });
    const preserved = existing.filter((r) => r.clockInAt !== null).length;

    await tx.attendanceRecord.updateMany({
        where: { employeeId: req.employeeId, workDate: range, clockInAt: null },
        data: { status: 'ON_LEAVE', source: 'MANUAL' },
    });

    const covered = new Set(existing.map((r) => dayKey(r.workDate)));
    const missing = dates.filter((d) => !covered.has(dayKey(d)));
    if (missing.length === 0) return preserved;

    const assignments = await loadAssignments(tx, req.employeeId, first, last);
    const fallback = await loadDefaultShift(tx);
    const rows = missing.flatMap((workDate) => {
        const shift = assignedShiftFor(assignments, workDate) ?? fallback;
        return shift ? [buildLeaveRecord(req, workDate, shift)] : [];
    });
    if (rows.length > 0) {
        await tx.attendanceRecord.createMany({ data: rows, skipDuplicates: true });
    }
    return preserved;
}

export const LeaveService = {
    async list(
        db: PrismaClient,
        filters?: {
            employeeId?: string;
            status?: 'PENDING' | 'APPROVED' | 'REJECTED';
        },
    ) {
        const where: Record<string, unknown> = {};
        if (filters?.employeeId) where.employeeId = filters.employeeId;
        if (filters?.status) where.status = filters.status;
        return db.leaveRequest.findMany({
            where: where as never,
            include: {
                employee: { select: { id: true, name: true, code: true } },
                reviewedBy: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    },

    /**
     * Leave recap for a calendar month: requests that overlap the month.
     * totalDays = inclusive days of the full request (not clipped to month — YAGNI).
     */
    async getRecap(db: PrismaClient, year: number, month: number) {
        const monthStart = new Date(Date.UTC(year, month - 1, 1));
        const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
        const rows = await db.leaveRequest.findMany({
            where: {
                startDate: { lte: monthEnd },
                endDate: { gte: monthStart },
            },
            include: {
                employee: { select: { id: true, name: true, code: true } },
            },
            orderBy: { startDate: 'asc' },
        });

        const byTypeStatus = new Map<
            string,
            { type: string; status: string; count: number; totalDays: number }
        >();
        let pending = 0;
        let approved = 0;
        let rejected = 0;
        let totalDaysApproved = 0;

        for (const r of rows) {
            const days = leaveDayCount(r.startDate, r.endDate);
            const key = `${r.type}|${r.status}`;
            const existing = byTypeStatus.get(key) ?? {
                type: r.type,
                status: r.status,
                count: 0,
                totalDays: 0,
            };
            existing.count += 1;
            existing.totalDays += days;
            byTypeStatus.set(key, existing);

            if (r.status === 'PENDING') pending += 1;
            else if (r.status === 'APPROVED') {
                approved += 1;
                totalDaysApproved += days;
            } else if (r.status === 'REJECTED') rejected += 1;
        }

        return {
            rows,
            byTypeStatus: Array.from(byTypeStatus.values()),
            totals: {
                pending,
                approved,
                rejected,
                totalDaysApproved,
                requestCount: rows.length,
            },
        };
    },

    async create(db: PrismaClient, data: LeaveRequestInput) {
        assertSafeDocumentUrl(data.documentUrl);
        if (data.endDate < data.startDate) {
            throw new BusinessRuleError(
                'Tanggal selesai tidak boleh sebelum tanggal mulai',
            );
        }
        const employee = await db.employee.findUnique({
            where: { id: data.employeeId },
            select: { id: true, name: true },
        });
        if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');
        return db.leaveRequest.create({
            data: {
                employeeId: data.employeeId,
                type: data.type,
                startDate: data.startDate,
                endDate: data.endDate,
                reason: data.reason?.trim() || null,
                documentUrl: data.documentUrl ?? null,
                status: 'PENDING',
            },
        });
    },

    /**
     * Approve leave + sync AttendanceRecord to ON_LEAVE for the date range.
     * - The PENDING -> APPROVED claim is atomic inside the transaction, so only
     *   one concurrent reviewer wins.
     * - Records without a clock-in in range -> ON_LEAVE / MANUAL.
     * - Records that already have a clock-in are kept as-is and counted in
     *   `preservedAttendanceCount`.
     * - Missing days get an ON_LEAVE record (assigned shift, else first ACTIVE
     *   WorkShift). Skipped when no shift can be resolved (best-effort).
     */
    async approve(
        db: PrismaClient,
        id: string,
        reviewNotes: string | undefined,
        reviewedById: string,
    ) {
        return db.$transaction(async (tx) => {
            const req = await findRequestOrThrow(tx, id);
            const dates = leaveDatesOrThrow(req);
            const updated = await claimPendingRequest(
                tx,
                req,
                'APPROVED',
                reviewNotes,
                reviewedById,
            );
            const preservedAttendanceCount = await syncLeaveAttendance(
                tx,
                req,
                dates,
            );
            return { ...updated, preservedAttendanceCount };
        });
    },

    async reject(
        db: PrismaClient,
        id: string,
        reviewNotes: string | undefined,
        reviewedById: string,
    ) {
        return db.$transaction(async (tx) => {
            const req = await findRequestOrThrow(tx, id);
            return claimPendingRequest(
                tx,
                req,
                'REJECTED',
                reviewNotes,
                reviewedById,
            );
        });
    },
};
