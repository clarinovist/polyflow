import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getMachineStageSettings,
    saveMachineStageSettings,
} from '../machine-stage-settings';
import { prisma } from '@/lib/core/prisma';
import { auth } from '@/auth';
import { isTenantAdmin } from '@/lib/auth/roles';

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

const DEFAULT_VALUE = JSON.stringify({
    MIXING: ['MIXER'],
    EXTRUSION: ['EXTRUDER', 'REWINDER'],
    PACKING: ['PACKER', 'GRANULATOR'],
    REWORK: ['MIXER', 'EXTRUDER', 'REWINDER', 'PACKER', 'GRANULATOR'],
    STANDARD: ['EXTRUDER', 'MIXER'],
});

describe('machine-stage-settings actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'admin-1', role: 'TENANT_ADMIN' },
        } as any);
        vi.mocked(isTenantAdmin).mockReturnValue(true);
    });

    describe('getMachineStageSettings', () => {
        it('returns default map when setting missing', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null);
            const res = await getMachineStageSettings();
            expect(res.success).toBe(true);
            if (!res.success) return;
            expect(res.data).toMatchObject({
                MIXING: ['MIXER'],
                PACKING: ['PACKER', 'GRANULATOR'],
            });
        });

        it('returns override for PACKING from stored setting', async () => {
            vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({
                value: JSON.stringify({
                    PACKING: ['PACKER', 'GRANULATOR', 'REWINDER'],
                }),
            } as any);
            const res = await getMachineStageSettings();
            expect(res.success).toBe(true);
            if (!res.success) return;
            expect(res.data.PACKING).toEqual(['PACKER', 'GRANULATOR', 'REWINDER']);
            // absent keys fall back to default
            expect(res.data.MIXING).toEqual(['MIXER']);
        });

        it('rejects non-admin', async () => {
            vi.mocked(isTenantAdmin).mockReturnValue(false);
            const res = await getMachineStageSettings();
            expect(res.success).toBe(false);
        });
    });

    describe('saveMachineStageSettings', () => {
        it('persists valid map via upsert', async () => {
            vi.mocked(prisma.appSetting.upsert).mockResolvedValue({
                key: 'production.machineStageMap',
                value: DEFAULT_VALUE,
            } as any);
            const input: Parameters<typeof saveMachineStageSettings>[0] = {
                MIXING: ['MIXER'],
                EXTRUSION: ['EXTRUDER', 'REWINDER'],
                PACKING: ['PACKER', 'GRANULATOR'],
                REWORK: ['MIXER', 'EXTRUDER', 'REWINDER', 'PACKER', 'GRANULATOR'],
                STANDARD: ['EXTRUDER', 'MIXER'],
            };
            const res = await saveMachineStageSettings(input);
            expect(res.success).toBe(true);
            expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { key: 'production.machineStageMap' },
                }),
            );
        });

        it('rejects invalid stage key', async () => {
            const res = await saveMachineStageSettings({
                MIXING: ['MIXER'],
                EXTRUSION: ['EXTRUDER', 'REWINDER'],
                PACKING: ['PACKER', 'GRANULATOR'],
                REWORK: ['MIXER', 'EXTRUDER', 'REWINDER', 'PACKER', 'GRANULATOR'],
                STANDARD: ['EXTRUDER', 'MIXER'],
                BOGUS: ['MIXER'],
            } as any);
            expect(res.success).toBe(false);
            expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
        });

        it('rejects unknown machine type', async () => {
            const res = await saveMachineStageSettings({
                MIXING: ['MIXER'],
                EXTRUSION: ['EXTRUDER', 'REWINDER'],
                PACKING: ['PACKER', 'GRANULATOR', 'NOPE'],
                REWORK: ['MIXER', 'EXTRUDER', 'REWINDER', 'PACKER', 'GRANULATOR'],
                STANDARD: ['EXTRUDER', 'MIXER'],
            } as any);
            expect(res.success).toBe(false);
        });
    });
});
