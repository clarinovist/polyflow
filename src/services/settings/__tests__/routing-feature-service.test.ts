import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    readRoutingFeatureSettings,
    saveRoutingFeatureSettings,
} from '../routing-feature-service';
import { prisma } from '@/lib/core/prisma';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        appSetting: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

describe('routing-feature-service', () => {
    const originalEnv = process.env.ROUTING_ENABLED;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.env.ROUTING_ENABLED = originalEnv;
    });

    describe('readRoutingFeatureSettings', () => {
        it('returns tenantEnabled=true when stored value is explicit true', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({
                value: 'true',
            } as never);
            await expect(readRoutingFeatureSettings()).resolves.toMatchObject({
                tenantEnabled: true,
            });
        });

        it('returns tenantEnabled=false when setting missing', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null);
            await expect(readRoutingFeatureSettings()).resolves.toMatchObject({
                tenantEnabled: false,
            });
        });

        it('returns tenantEnabled=false when value malformed', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({
                value: 'yes',
            } as never);
            await expect(readRoutingFeatureSettings()).resolves.toMatchObject({
                tenantEnabled: false,
            });
        });

        it('reflects globalEnvEnabled from ROUTING_ENABLED env var', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null);

            process.env.ROUTING_ENABLED = 'true';
            await expect(readRoutingFeatureSettings()).resolves.toMatchObject({
                globalEnvEnabled: true,
            });

            process.env.ROUTING_ENABLED = 'false';
            await expect(readRoutingFeatureSettings()).resolves.toMatchObject({
                globalEnvEnabled: false,
            });

            delete process.env.ROUTING_ENABLED;
            await expect(readRoutingFeatureSettings()).resolves.toMatchObject({
                globalEnvEnabled: false,
            });
        });
    });

    describe('saveRoutingFeatureSettings', () => {
        it('persists enabled=true via upsert with updatedBy and the shared setting key', async () => {
            vi.mocked(prisma.appSetting.upsert).mockResolvedValue({} as never);
            const result = await saveRoutingFeatureSettings(true, 'admin-1');
            expect(result).toBe(true);
            expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { key: 'feature.routing.enabled' },
                    create: expect.objectContaining({
                        key: 'feature.routing.enabled',
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
            await saveRoutingFeatureSettings(false, 'admin-1');
            expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    update: expect.objectContaining({ value: 'false' }),
                }),
            );
        });
    });
});
