import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getShellCloseSettings, saveShellCloseSettings } from '../shell-close-settings';

const m = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock('@/auth', () => ({ auth: m.auth }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/services/settings/shell-close-setting-service', () => ({
    readShellCloseAtLastOutput: m.read,
    saveShellCloseAtLastOutput: m.save,
}));

describe('shell close settings actions', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        m.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
        m.read.mockResolvedValue(true);
        m.save.mockImplementation(async (enabled: boolean) => enabled);
    });

    it('returns the tenant choice to an admin', async () => {
        await expect(getShellCloseSettings()).resolves.toEqual({ success: true, data: { atLastOutput: true } });
    });

    it('saves the choice with the admin as editor', async () => {
        await expect(saveShellCloseSettings({ atLastOutput: false })).resolves.toEqual({ success: true, data: { atLastOutput: false } });
        expect(m.save).toHaveBeenCalledWith(false, 'admin-1');
    });

    it('refuses non-admins before reading or writing the setting', async () => {
        m.auth.mockResolvedValue({ user: { id: 'u-1', role: 'PRODUCTION' } });

        await expect(getShellCloseSettings()).resolves.toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        await expect(saveShellCloseSettings({ atLastOutput: true })).resolves.toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        expect(m.read).not.toHaveBeenCalled();
        expect(m.save).not.toHaveBeenCalled();
    });

    it('rejects anything but a boolean choice', async () => {
        const res = await saveShellCloseSettings({ atLastOutput: 'true' } as never);

        expect(res).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(m.save).not.toHaveBeenCalled();
    });
});
