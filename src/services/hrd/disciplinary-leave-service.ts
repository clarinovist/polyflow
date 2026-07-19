/**
 * HRD Services — Disciplinary Actions & Leave Requests (Fase 4, §10 + §14).
 * Pure functions over a Prisma client (no 'use server').
 */

import type { PrismaClient } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';

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

    async create(db: PrismaClient, data: DisciplinaryInput) {
        if (!data.reason.trim()) throw new BusinessRuleError('Alasan sanksi wajib diisi');
        const employee = await db.employee.findUnique({
            where: { id: data.employeeId },
            select: { id: true, name: true, code: true },
        });
        if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');
        if (data.expiryDate && data.expiryDate < data.effectiveDate) {
            throw new BusinessRuleError('Tanggal hangus tidak boleh sebelum tanggal berlaku');
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
            include: { employee: { select: { id: true, name: true, code: true } } },
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
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    while (d <= last) {
        dates.push(new Date(d));
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return dates;
}

export const LeaveService = {
    async list(
        db: PrismaClient,
        filters?: { employeeId?: string; status?: 'PENDING' | 'APPROVED' | 'REJECTED' },
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

    async create(db: PrismaClient, data: LeaveRequestInput) {
        if (data.endDate < data.startDate) {
            throw new BusinessRuleError('Tanggal selesai tidak boleh sebelum tanggal mulai');
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
     * - Updates existing records in range → ON_LEAVE / MANUAL
     * - Creates one ON_LEAVE record per day (using first ACTIVE WorkShift) when missing
     * Attendance create is best-effort if no WorkShift master exists.
     */
    async approve(db: PrismaClient, id: string, reviewNotes: string | undefined, reviewedById: string) {
        const req = await db.leaveRequest.findUnique({ where: { id } });
        if (!req) throw new NotFoundError('Pengajuan cuti tidak ditemukan');
        if (req.status !== 'PENDING') throw new BusinessRuleError('Pengajuan sudah diproses');

        return db.$transaction(async (tx) => {
            const updated = await tx.leaveRequest.update({
                where: { id },
                data: {
                    status: 'APPROVED',
                    reviewedAt: new Date(),
                    reviewedById,
                    reviewNotes: reviewNotes?.trim() || null,
                },
            });

            // Update any existing attendance rows in range.
            await tx.attendanceRecord.updateMany({
                where: {
                    employeeId: req.employeeId,
                    workDate: { gte: req.startDate, lte: req.endDate },
                },
                data: { status: 'ON_LEAVE', source: 'MANUAL' },
            });

            // Create missing day records so prorata can distinguish leave vs absent.
            const defaultShift = await tx.workShift.findFirst({
                where: { status: 'ACTIVE' },
                orderBy: { createdAt: 'asc' },
                select: { id: true, plannedHours: true },
            });

            if (defaultShift) {
                const dates = eachUtcDateInclusive(req.startDate, req.endDate);
                for (const workDate of dates) {
                    const existing = await tx.attendanceRecord.findFirst({
                        where: { employeeId: req.employeeId, workDate },
                        select: { id: true },
                    });
                    if (existing) continue;
                    await tx.attendanceRecord.create({
                        data: {
                            employeeId: req.employeeId,
                            workDate,
                            workShiftId: defaultShift.id,
                            status: 'ON_LEAVE',
                            source: 'MANUAL',
                            notes: `Auto from leave request ${req.id}`,
                            plannedHours: defaultShift.plannedHours ?? 8,
                            regularHours: 0,
                            overtimeHours: 0,
                            dailyEarnings: 0,
                            overtimeEarnings: 0,
                            totalEarnings: 0,
                        },
                    });
                }
            }

            return updated;
        });
    },

    async reject(db: PrismaClient, id: string, reviewNotes: string | undefined, reviewedById: string) {
        const req = await db.leaveRequest.findUnique({ where: { id } });
        if (!req) throw new NotFoundError('Pengajuan cuti tidak ditemukan');
        if (req.status !== 'PENDING') throw new BusinessRuleError('Pengajuan sudah diproses');
        return db.leaveRequest.update({
            where: { id },
            data: {
                status: 'REJECTED',
                reviewedAt: new Date(),
                reviewedById,
                reviewNotes: reviewNotes?.trim() || null,
            },
        });
    },
};
