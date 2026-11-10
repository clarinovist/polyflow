import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    requireRole: vi.fn(),
    redirect: vi.fn((path: string) => {
        throw new Error(`NEXT_REDIRECT:${path}`);
    }),
}));

vi.mock('next/navigation', async (importOriginal) => ({
    ...(await importOriginal<typeof import('next/navigation')>()),
    redirect: mocks.redirect,
}));
vi.mock('@prisma/client', () => ({
    Role: { WAREHOUSE: 'WAREHOUSE', PRODUCTION: 'PRODUCTION', PLANNING: 'PLANNING' },
}));
vi.mock('@/lib/tools/auth-checks', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/actions/inventory/opname', () => ({
    getOpnameSessions: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));
vi.mock('@/components/warehouse/inventory/opname/CreateOpnameDialog', () => ({
    CreateOpnameDialog: () => null,
}));
vi.mock('@/components/shared/SearchParamsToast', () => ({
    SearchParamsToast: () => null,
}));

import WarehouseOpnameListPage from '../page';

const redirectError = () =>
    Object.assign(new Error('NEXT_REDIRECT'), {
        digest: 'NEXT_REDIRECT;replace;/login;307;',
    });

describe('warehouse opname page — sesi habis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('pengguna belum login diarahkan ke /login, tidak ke /dashboard', async () => {
        mocks.requireRole.mockRejectedValue(redirectError());
        await expect(WarehouseOpnameListPage()).rejects.toThrow('NEXT_REDIRECT');
        expect(mocks.redirect).not.toHaveBeenCalledWith('/dashboard');
    });

    it('error peran biasa tetap diarahkan ke /dashboard', async () => {
        mocks.requireRole.mockRejectedValue(new Error('forbidden'));
        await expect(WarehouseOpnameListPage()).rejects.toThrow(
            'NEXT_REDIRECT:/dashboard',
        );
        expect(mocks.redirect).toHaveBeenCalledWith('/dashboard');
    });
});
