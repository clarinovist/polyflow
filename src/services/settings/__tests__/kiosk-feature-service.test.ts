import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    readKioskFeatureSettings,
    saveKioskFeatureSettings,
} from '../kiosk-feature-service';
import { prisma } from '@/lib/core/prisma';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        appSetting: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

describe('kiosk-feature-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('readKioskFeatureSettings', () => {
        it('returns true when stored value is explicit true', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({
                value: 'true',
            } as never);
            await expect(readKioskFeatureSettings()).resolves.toBe(true);
        });

        it('returns false when stored value is explicit false', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({
                value: 'false',
            } as never);
            await expect(readKioskFeatureSettings()).resolves.toBe(false);
        });

        it('returns false when setting missing', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null);
            await expect(readKioskFeatureSettings()).resolves.toBe(false);
        });

        it('returns false when setting malformed', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({
                value: 'yes',
            } as never);
            await expect(readKioskFeatureSettings()).resolves.toBe(false);
        });
    });

    describe('saveKioskFeatureSettings', () => {
        it('persists enabled=true via upsert with updatedBy', async () => {
            vi.mocked(prisma.appSetting.upsert).mockResolvedValue({} as never);
            const result = await saveKioskFeatureSettings(true, 'admin-1');
            expect(result).toBe(true);
            expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { key: 'kiosk.prosesKhususEnabled' },
                    create: expect.objectContaining({
                        key: 'kiosk.prosesKhususEnabled',
                        value: 'true',
                        updatedBy: 'admin-1',
                    }),
                    update: expect.objectContaining({
                        value: 'true',
                        updatedBy: 'admin-1',
                    }),
                }),
            );
        });

        it('persists enabled=false', async () => {
            vi.mocked(prisma.appSetting.upsert).mockResolvedValue({} as never);
            await saveKioskFeatureSettings(false, 'admin-1');
            expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    update: expect.objectContaining({ value: 'false' }),
                }),
            );
        });
    });
});
