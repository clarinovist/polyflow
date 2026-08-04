import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getProductionAlertThresholds,
    getProductionAlertThresholdsForPage,
    saveProductionAlertThresholds,
} from '../alert-threshold-settings';
import { prisma } from '@/lib/core/prisma';
import { auth } from '@/auth';
import { isTenantAdmin } from '@/lib/auth/roles';
import { revalidatePath } from 'next/cache';
import { DEFAULT_PRODUCTION_ALERT_THRESHOLDS } from '@/lib/production/alert-thresholds';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        appSetting: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
    isTenantAdmin: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: any) => fn,
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn() },
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
}));

const VALID_INPUT = {
    scrapWarningPercent: 3,
    scrapAnomalyPercent: 6,
    scrapCriticalQuantity: 60,
    downtimeCriticalMinutes: 45,
    lowThroughputPerHour: 40,
};

const STORED = JSON.stringify(VALID_INPUT);

describe('alert-threshold-settings actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'admin-1', role: 'TENANT_ADMIN' },
        } as any);
        vi.mocked(isTenantAdmin).mockReturnValue(true);
        vi.mocked(revalidatePath).mockReturnValue(undefined as never);
    });

    describe('getProductionAlertThresholds (admin read)', () => {
        it('returns defaults when setting missing', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null);
            const res = await getProductionAlertThresholds();
            expect(res.success).toBe(true);
            if (!res.success) return;
            expect(res.data).toEqual(DEFAULT_PRODUCTION_ALERT_THRESHOLDS);
        });

        it('returns stored thresholds', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({
                value: STORED,
            } as any);
            const res = await getProductionAlertThresholds();
            expect(res.success).toBe(true);
            if (!res.success) return;
            expect(res.data).toEqual(VALID_INPUT);
        });

        it('falls back to defaults when stored JSON is malformed', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({
                value: '{broken',
            } as any);
            const res = await getProductionAlertThresholds();
            expect(res.success).toBe(true);
            if (!res.success) return;
            expect(res.data).toEqual(DEFAULT_PRODUCTION_ALERT_THRESHOLDS);
        });

        it('rejects non-admin', async () => {
            vi.mocked(isTenantAdmin).mockReturnValue(false);
            const res = await getProductionAlertThresholds();
            expect(res.success).toBe(false);
        });
    });

    describe('getProductionAlertThresholdsForPage (authenticated read)', () => {
        it('returns resolved thresholds for any authenticated user', async () => {
            vi.mocked(auth).mockResolvedValue({
                user: { id: 'u1', role: 'PRODUCTION' },
            } as any);
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({
                value: STORED,
            } as any);
            const res = await getProductionAlertThresholdsForPage();
            expect(res.success).toBe(true);
            if (!res.success) return;
            expect(res.data).toEqual(VALID_INPUT);
        });
    });

    describe('saveProductionAlertThresholds', () => {
        it('persists valid thresholds via upsert with updatedBy', async () => {
            vi.mocked(prisma.appSetting.upsert).mockResolvedValue({
                key: 'production.alertThresholds',
                value: STORED,
            } as never);
            const res = await saveProductionAlertThresholds(VALID_INPUT);
            expect(res.success).toBe(true);
            expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { key: 'production.alertThresholds' },
                    create: expect.objectContaining({
                        key: 'production.alertThresholds',
                        value: STORED,
                        updatedBy: 'admin-1',
                    }),
                    update: expect.objectContaining({
                        value: STORED,
                        updatedBy: 'admin-1',
                    }),
                }),
            );
        });

        it('revalidates the affected production pages', async () => {
            vi.mocked(prisma.appSetting.upsert).mockResolvedValue({
                key: 'production.alertThresholds',
                value: STORED,
            } as never);
            await saveProductionAlertThresholds(VALID_INPUT);
            expect(revalidatePath).toHaveBeenCalledWith('/production/analytics');
            expect(revalidatePath).toHaveBeenCalledWith('/production');
            expect(revalidatePath).toHaveBeenCalledWith('/production/history');
            expect(revalidatePath).toHaveBeenCalledWith('/production/mobile');
            expect(revalidatePath).toHaveBeenCalledWith('/dashboard/machines');
        });

        it('rejects invalid zod input (negative percent)', async () => {
            const res = await saveProductionAlertThresholds({
                ...VALID_INPUT,
                scrapWarningPercent: -1,
            });
            expect(res.success).toBe(false);
            expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
        });

        it('rejects invalid zod input (out-of-range percent)', async () => {
            const res = await saveProductionAlertThresholds({
                ...VALID_INPUT,
                scrapAnomalyPercent: 101,
            });
            expect(res.success).toBe(false);
            expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
        });

        it('rejects non-admin', async () => {
            vi.mocked(isTenantAdmin).mockReturnValue(false);
            const res = await saveProductionAlertThresholds(VALID_INPUT);
            expect(res.success).toBe(false);
            expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
        });

        it('returns stored error message when upsert fails', async () => {
            vi.mocked(prisma.appSetting.upsert).mockRejectedValue(
                new Error('db down'),
            );
            const res = await saveProductionAlertThresholds(VALID_INPUT);
            expect(res.success).toBe(false);
        });
    });
});
