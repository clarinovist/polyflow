'use server';

/**
 * HRD Services — Disciplinary Actions & Leave Requests (Fase 4, §10 + §14).
 * Pure functions over a Prisma client. Used by server actions in `actions/hrd/`.
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
            include: { employee: { select: { id: true, name: true, code: true } }, issuedBy: { select: { id: true, name: true } } },
            orderBy: { effectiveDate: 'desc' },
        });
    },

    async create(db: PrismaClient, data: DisciplinaryInput) {
        if (!data.reason.trim()) throw new BusinessRuleError('Alasan sanksi wajib diisi');
        const employee = await db.employee.findUnique({ where: { id: data.employeeId }, select: { id: true, name: true, code: true } });
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
        // Intentionally hard delete — sanksi yang salah input sebaiknya dihapus,
        // bukan di-soft-delete, agar tidak memenuhi riwayat.
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

export const LeaveService = {
    async list(db: PrismaClient, filters?: { employeeId?: string; status?: 'PENDING' | 'APPROVED' | 'REJECTED' }) {
        const where: Record<string, unknown> = {};
        if (filters?.employeeId) where.employeeId = filters.employeeId;
        if (filters?.status) where.status = filters.status;
        return db.leaveRequest.findMany({
            where: where as never,
            include: { employee: { select: { id: true, name: true, code: true } }, reviewedBy: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
        });
    },

    async create(db: PrismaClient, data: LeaveRequestInput) {
        if (data.endDate < data.startDate) {
            throw new BusinessRuleError('Tanggal selesai tidak boleh sebelum tanggal mulai');
        }
        const employee = await db.employee.findUnique({ where: { id: data.employeeId }, select: { id: true, name: true } });
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
     * Approve a leave request. As a side-effect (§14.3 step 3), mark attendance
     * records within [startDate, endDate] as ON_LEAVE (manual source). Idempotent —
     * safe to call multiple times. Does NOT auto-create records; admin may need to
     * set shifts manually if dates are in the future without attendance entries.
     */
    async approve(db: PrismaClient, id: string, reviewNotes: string | undefined, reviewedById: string) {
        const req = await db.leaveRequest.findUnique({ where: { id } });
        if (!req) throw new NotFoundError('Pengajuan cuti tidak ditemukan');
        if (req.status !== 'PENDING') throw new BusinessRuleError('Pengajuan sudah diproses');

        return db.$transaction(async (tx) => {
            const updated = await tx.leaveRequest.update({
                where: { id },
                data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById, reviewNotes: reviewNotes?.trim() || null },
            });

            // Best-effort: update existing attendance records in [start, end] to ON_LEAVE.
            // We don't create new records here — admin should have shifts set per day; if not,
            // payroll proration still treats uncovered future days as "not ABSENT, just no attendance"
            // (functionally equivalent to ON_LEAVE for monthly proration semantics).
            try {
                await tx.attendanceRecord.updateMany({
                    where: {
                        employeeId: req.employeeId,
                        workDate: { gte: req.startDate, lte: req.endDate },
                    },
                    data: { status: 'ON_LEAVE', source: 'MANUAL' },
                });
            } catch {
                // Non-fatal: leave is still approved; only the side-sync to attendance failed.
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
            data: { status: 'REJECTED', reviewedAt: new Date(), reviewedById, reviewNotes: reviewNotes?.trim() || null },
        });
    },
};
