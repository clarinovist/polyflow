'use server';

import { withTenant } from "@/lib/core/tenant";
import { requireAuth, requireRole } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { revalidatePath } from 'next/cache';
import { PettyCashReportService } from '@/services/finance/petty-cash-report-service';
import { parseBusinessDate } from '@/lib/utils/timezone';
import { prisma } from '@/lib/core/prisma';
import { Role } from '@prisma/client';

const REPORT_PATH = '/finance/petty-cash/reports/daily';
const MUTATING_ROLES: Role[] = [Role.ADMIN, Role.FINANCE];

const SIGNATURE_KEYS: Record<string, string> = {
    kasir: 'cashOpname.signer.kasir',
    akuntansi: 'cashOpname.signer.akuntansi',
    direktur: 'cashOpname.signer.direktur',
    komisaris: 'cashOpname.signer.komisaris',
};

export const getCashOpnameSignaturesAction = withTenant(async function () {
    return safeAction(async () => {
        await requireAuth();
        const rows = await prisma.appSetting.findMany({
            where: { key: { in: Object.values(SIGNATURE_KEYS) } },
            select: { key: true, value: true },
        });
        const byKey = new Map(rows.map((r) => [r.key, r.value]));
        const result: Record<string, string> = {};
        for (const [field, key] of Object.entries(SIGNATURE_KEYS)) {
            const v = byKey.get(key);
            if (v) result[field] = v;
        }
        return result;
    });
});

export const saveCashOpnameSignaturesAction = withTenant(async function (input: Record<string, string>) {
    return safeAction(async () => {
        const session = await requireRole(MUTATING_ROLES);
        const entries = Object.entries(input).filter(([, v]) => (v ?? '').trim() !== '');
        if (entries.length === 0) return { saved: [] as string[] };
        const upserts = entries
            .filter(([field]) => SIGNATURE_KEYS[field])
            .map(([field, value]) => {
                const key = SIGNATURE_KEYS[field];
                return prisma.appSetting.upsert({
                    where: { key },
                    create: { key, value: value.trim(), updatedBy: session.user.id },
                    update: { value: value.trim(), updatedBy: session.user.id },
                });
            });
        await prisma.$transaction(upserts);
        return { saved: entries.map(([k]) => k) };
    });
});

/**
 * Validate a YYYY-MM-DD date string (business calendar date).
 * Returns the validated string — does NOT convert to Date object.
 * The service layer uses getWibDayBounds() for correct WIB-aware filtering.
 */
function validateDateStr(dateStr: string): string {
    return parseBusinessDate(dateStr); // throws BusinessRuleError-like on invalid
}

export const getDailyPettyCashReportAction = withTenant(
    async function getDailyPettyCashReportAction(dateStr: string) {
        return safeAction(async () => {
            await requireAuth();
            const date = validateDateStr(dateStr);
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
                const date = validateDateStr(dateStr);
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
