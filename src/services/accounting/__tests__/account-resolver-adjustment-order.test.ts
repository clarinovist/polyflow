import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Account } from '@prisma/client';
import { resolveByPatterns } from '../account-resolver';

type PatternDbArg = Parameters<typeof resolveByPatterns>[1];

vi.mock('@/lib/core/prisma', () => ({
    prisma: {},
}));

type StubAccount = Pick<Account, 'id' | 'code' | 'name' | 'isActive'>;

/**
 * Membangun stub PatternDb dari daftar akun sebuah tenant.
 * Meniru perilaku findUnique(code) + findFirst(name contains, isActive).
 */
function makeDb(accounts: StubAccount[]): NonNullable<PatternDbArg> {
    const stub = {
        account: {
            findUnique: async ({ where }: { where: { code: string } }) =>
                accounts.find((a) => a.code === where.code) ?? null,
            findFirst: async ({ where }: { where: Record<string, unknown> }) => {
                const nameFilter = where.name as
                    | { contains?: string }
                    | undefined;
                const needle = nameFilter?.contains?.toLowerCase();
                const mustBeActive = where.isActive === true;
                const found = accounts
                    .filter((a) => (mustBeActive ? a.isActive !== false : true))
                    .filter((a) =>
                        needle ? a.name.toLowerCase().includes(needle) : true,
                    )
                    .sort((x, y) => x.code.localeCompare(y.code));
                return found[0] ?? null;
            },
        },
    };
    return stub as unknown as NonNullable<PatternDbArg>;
}

const ID_STYLE_COA_MARKER: StubAccount = {
    id: 'rm',
    code: '1-130',
    name: 'Persediaan Bahan Baku',
    isActive: true,
};

describe('ACCOUNT_ROLE_PATTERNS — prioritas akun selisih persediaan', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('COA gaya Indonesia (7-xxx/8-xxx): pilih 7-103/8-203, BUKAN 7-101/8-202', async () => {
        const db = makeDb([
            ID_STYLE_COA_MARKER,
            { id: 'a', code: '7-101', name: 'Pendapatan Lain-lain Diluar Usaha', isActive: true },
            { id: 'b', code: '7-1000', name: 'PENDAPATAN LAIN-LAIN', isActive: true },
            { id: 'c', code: '7-103', name: 'Selisih Lebih Persediaan', isActive: true },
            { id: 'd', code: '8-202', name: 'Biaya Lain-lain Diluar Usaha', isActive: true },
            { id: 'e', code: '8-1000', name: 'BEBAN LAIN-LAIN', isActive: true },
            { id: 'f', code: '8-203', name: 'Selisih Kurang Persediaan', isActive: true },
        ]);

        const gain = await resolveByPatterns('adjustment-gain', db);
        const loss = await resolveByPatterns('adjustment-loss', db);

        expect(gain.code).toBe('7-103');
        expect(loss.code).toBe('8-203');
    });

    it('COA gaya 5-digit: tetap 81100/91100 (tidak tergeser)', async () => {
        const db = makeDb([
            { id: 'g', code: '81100', name: 'Inventory Adjustment Gain', isActive: true },
            { id: 'h', code: '91100', name: 'Inventory Adjustment Loss', isActive: true },
        ]);

        const gain = await resolveByPatterns('adjustment-gain', db);
        const loss = await resolveByPatterns('adjustment-loss', db);

        expect(gain.code).toBe('81100');
        expect(loss.code).toBe('91100');
    });

    it('COA legacy tanpa akun selisih: fallback 7-101/8-202 tetap hidup', async () => {
        const db = makeDb([
            ID_STYLE_COA_MARKER,
            { id: 'a', code: '7-101', name: 'Pendapatan Lain-lain Diluar Usaha', isActive: true },
            { id: 'd', code: '8-202', name: 'Biaya Lain-lain Diluar Usaha', isActive: true },
        ]);

        const gain = await resolveByPatterns('adjustment-gain', db);
        const loss = await resolveByPatterns('adjustment-loss', db);

        expect(gain.code).toBe('7-101');
        expect(loss.code).toBe('8-202');
    });

    it('akun selisih nonaktif: lewati, jangan throw', async () => {
        const db = makeDb([
            ID_STYLE_COA_MARKER,
            { id: 'c', code: '7-103', name: 'Selisih Lebih Persediaan', isActive: false },
            { id: 'a', code: '7-101', name: 'Pendapatan Lain-lain Diluar Usaha', isActive: true },
            { id: 'f', code: '8-203', name: 'Selisih Kurang Persediaan', isActive: false },
            { id: 'd', code: '8-202', name: 'Biaya Lain-lain Diluar Usaha', isActive: true },
        ]);

        const gain = await resolveByPatterns('adjustment-gain', db);
        const loss = await resolveByPatterns('adjustment-loss', db);

        expect(gain.code).toBe('7-101');
        expect(loss.code).toBe('8-202');
    });
});
