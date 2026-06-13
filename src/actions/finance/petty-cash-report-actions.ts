'use server';

import { withTenant } from "@/lib/core/tenant";
import { requireAuth, requireRole } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { revalidatePath } from 'next/cache';
import { PettyCashReportService } from '@/services/finance/petty-cash-report-service';
import { Role } from '@prisma/client';

const REPORT_PATH = '/finance/petty-cash/reports/daily';
const MUTATING_ROLES: Role[] = [Role.ADMIN, Role.FINANCE];

/**
 * Validate and parse a YYYY-MM-DD date string.
 * Throws BusinessRuleError if invalid.
 */
function parseAndValidateDate(dateStr: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new BusinessRuleError('Format tanggal tidak valid. Gunakan YYYY-MM-DD.');
    }
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) {
        throw new BusinessRuleError('Tanggal tidak valid.');
    }
    return date;
}

export const getDailyPettyCashReportAction = withTenant(
    async function getDailyPettyCashReportAction(dateStr: string) {
        return safeAction(async () => {
            await requireAuth();
            const date = parseAndValidateDate(dateStr);
            const report = await PettyCashReportService.getDailyReport(date);
            return serializeData(report);
        });
    }
);

export const createPettyCashDailyReportAction = withTenant(
    async function createPettyCashDailyReportAction(dateStr: string) {
        return safeAction(async () => {
            const session = await requireRole(MUTATING_ROLES);
            try {
                const date = parseAndValidateDate(dateStr);
                const report = await PettyCashReportService.createDailyReport(date, session.user.id);
                revalidatePath(REPORT_PATH);
                return serializeData(report);
            } catch (error) {
                throw new BusinessRuleError(error instanceof Error ? error.message : 'Gagal membuat laporan.');
            }
        });
    }
);

export const markPettyCashDailyReportReadyToPrintAction = withTenant(
    async function markPettyCashDailyReportReadyToPrintAction(id: string) {
        return safeAction(async () => {
            const session = await requireRole(MUTATING_ROLES);
            try {
                const report = await PettyCashReportService.markReadyToPrint(id, session.user.id);
                revalidatePath(REPORT_PATH);
                return serializeData(report);
            } catch (error) {
                throw new BusinessRuleError(error instanceof Error ? error.message : 'Gagal menandai laporan siap cetak.');
            }
        });
    }
);

export const confirmPettyCashDailyReportPhysicalSignatureAction = withTenant(
    async function confirmPettyCashDailyReportPhysicalSignatureAction(id: string) {
        return safeAction(async () => {
            const session = await requireRole(MUTATING_ROLES);
            try {
                const report = await PettyCashReportService.confirmPhysicalSignature(id, session.user.id);
                revalidatePath(REPORT_PATH);
                return serializeData(report);
            } catch (error) {
                throw new BusinessRuleError(error instanceof Error ? error.message : 'Gagal konfirmasi tanda tangan basah.');
            }
        });
    }
);

export const finalizePettyCashDailyReportAction = withTenant(
    async function finalizePettyCashDailyReportAction(id: string) {
        return safeAction(async () => {
            const session = await requireRole(MUTATING_ROLES);
            try {
                const report = await PettyCashReportService.finalizeDailyReport(id, session.user.id);
                revalidatePath(REPORT_PATH);
                return serializeData(report);
            } catch (error) {
                throw new BusinessRuleError(error instanceof Error ? error.message : 'Gagal finalisasi laporan.');
            }
        });
    }
);

export const voidPettyCashDailyReportAction = withTenant(
    async function voidPettyCashDailyReportAction(id: string) {
        return safeAction(async () => {
            const session = await requireRole(MUTATING_ROLES);
            try {
                const report = await PettyCashReportService.voidDailyReport(id, session.user.id);
                revalidatePath(REPORT_PATH);
                return serializeData(report);
            } catch (error) {
                throw new BusinessRuleError(error instanceof Error ? error.message : 'Gagal void laporan.');
            }
        });
    }
);
