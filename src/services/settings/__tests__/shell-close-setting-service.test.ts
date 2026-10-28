import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    isShellCloseAtLastOutput,
    readShellCloseAtLastOutput,
    saveShellCloseAtLastOutput,
    SHELL_CLOSE_SETTING_KEY,
} from '../shell-close-setting-service';
import { prisma } from '@/lib/core/prisma';

vi.mock('@/lib/core/prisma', () => ({
    prisma: { appSetting: { findUnique: vi.fn(), upsert: vi.fn() } },
}));

describe('shell-close-setting-service', () => {
    beforeEach(() => vi.clearAllMocks());

    it.each([
        ['true', true],
        ['false', false],
        ['TRUE', false],
        [null, false],
        [undefined, false],
    ])('parses %s as %s (anything but an explicit true keeps zero-length closing)', (raw, expected) => {
        expect(isShellCloseAtLastOutput(raw)).toBe(expected);
    });

    it('reads the tenant choice from AppSetting', async () => {
        vi.mocked(prisma.appSetting.findUnique).mockResolvedValue({ value: 'true' } as never);

        await expect(readShellCloseAtLastOutput()).resolves.toBe(true);
        expect(prisma.appSetting.findUnique).toHaveBeenCalledWith({
            where: { key: SHELL_CLOSE_SETTING_KEY },
            select: { value: true },
        });
    });

    it('defaults to zero-length closing when nothing is stored', async () => {
        vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null);

        await expect(readShellCloseAtLastOutput()).resolves.toBe(false);
    });

    it('stores the choice as an explicit boolean string with the editor', async () => {
        await expect(saveShellCloseAtLastOutput(true, 'admin-1')).resolves.toBe(true);

        expect(prisma.appSetting.upsert).toHaveBeenCalledWith({
            where: { key: SHELL_CLOSE_SETTING_KEY },
            create: { key: SHELL_CLOSE_SETTING_KEY, value: 'true', updatedBy: 'admin-1' },
            update: { value: 'true', updatedBy: 'admin-1' },
        });
    });
});
