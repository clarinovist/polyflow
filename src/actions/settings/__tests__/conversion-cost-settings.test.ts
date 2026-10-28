import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getConversionCostSettings, saveConversionCostSettings } from '../conversion-cost-settings';

const m = vi.hoisted(() => ({
    auth: vi.fn(),
    read: vi.fn(),
    save: vi.fn(),
    accounts: vi.fn(),
    revalidate: vi.fn(),
}));
vi.mock('@/auth', () => ({ auth: m.auth }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { account: { findMany: m.accounts } } }));
vi.mock('@/services/settings/conversion-cost-setting-service', () => ({
    MAX_CONVERSION_ACCOUNTS: 50,
    readConversionCostSetting: m.read,
    saveConversionCostSetting: m.save,
}));

const labour = { id: 'acc-labour', code: '5-012b', name: 'Tenaga kerja langsung', isActive: true };

describe('conversion cost settings actions', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        m.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
        m.read.mockResolvedValue({ enabled: true, accountIds: ['acc-old'] });
        m.accounts.mockResolvedValue([labour]);
        m.save.mockImplementation(async (setting: unknown) => setting);
    });

    it('returns the setting with active expense accounts plus any saved inactive one', async () => {
        await expect(getConversionCostSettings()).resolves.toEqual({
            success: true,
            data: { setting: { enabled: true, accountIds: ['acc-old'] }, accounts: [labour] },
        });
        expect(m.accounts).toHaveBeenCalledWith({
            where: { type: 'EXPENSE', OR: [{ isActive: true }, { id: { in: ['acc-old'] } }] },
            select: { id: true, code: true, name: true, isActive: true },
            orderBy: { code: 'asc' },
        });
    });

    it('saves deduplicated expense accounts with the admin as editor and refreshes cost pages', async () => {
        const res = await saveConversionCostSettings({ enabled: true, accountIds: ['acc-labour', 'acc-labour'] });

        expect(res).toEqual({ success: true, data: { enabled: true, accountIds: ['acc-labour'] } });
        expect(m.accounts).toHaveBeenCalledWith({
            where: { id: { in: ['acc-labour'] }, type: 'EXPENSE' },
            select: { id: true },
        });
        expect(m.save).toHaveBeenCalledWith({ enabled: true, accountIds: ['acc-labour'] }, 'admin-1');
        expect(m.revalidate).toHaveBeenCalledWith('/finance/reports/hpp');
    });

    it('rejects an account that is missing or not an expense account', async () => {
        m.accounts.mockResolvedValue([]);

        const res = await saveConversionCostSettings({ enabled: true, accountIds: ['acc-asset'] });

        expect(res).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(m.save).not.toHaveBeenCalled();
    });

    it('does not look up accounts when the allocation is switched off', async () => {
        await saveConversionCostSettings({ enabled: false, accountIds: ['acc-labour'] });

        expect(m.accounts).not.toHaveBeenCalled();
        expect(m.save).toHaveBeenCalledWith({ enabled: false, accountIds: ['acc-labour'] }, 'admin-1');
    });

    it.each([
        ['a non-boolean switch', { enabled: 'true', accountIds: [] }],
        ['an extra field', { enabled: true, accountIds: [], extra: 1 }],
        ['more than the account cap', { enabled: true, accountIds: Array.from({ length: 51 }, (_, i) => `acc-${i}`) }],
    ])('rejects %s before touching the database', async (_label, input) => {
        const res = await saveConversionCostSettings(input as never);

        expect(res).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
        expect(m.accounts).not.toHaveBeenCalled();
        expect(m.save).not.toHaveBeenCalled();
    });

    it('refuses non-admins before reading or writing anything', async () => {
        m.auth.mockResolvedValue({ user: { id: 'fin-1', role: 'FINANCE' } });

        await expect(getConversionCostSettings()).resolves.toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        await expect(saveConversionCostSettings({ enabled: true, accountIds: [] })).resolves.toMatchObject({ success: false, code: 'AUTHORIZATION_ERROR' });
        expect(m.read).not.toHaveBeenCalled();
        expect(m.save).not.toHaveBeenCalled();
    });
});
