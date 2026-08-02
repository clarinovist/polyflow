import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {},
}));

vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesFinance: vi.fn().mockResolvedValue({
        user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
    }),
}));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: (data: unknown) => data,
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/errors/errors', async () => {
    const actual = (await vi.importActual('@/lib/errors/errors')) as any;
    return {
        ...actual,
        safeAction: async (fn: () => Promise<unknown>) => {
            try {
                const data = await fn();
                return { success: true, data };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        },
    };
});

vi.mock('@/services/sales/commission-service', () => ({
    calculateCommission: vi.fn().mockResolvedValue({
        entries: [],
        unattributed: new Decimal(0),
        unattributedPaidRevenue: new Decimal(0),
        scheme: null,
        warnings: [],
        period: {
            from: new Date('2026-08-01'),
            to: new Date('2026-08-31'),
            periodYear: 2026,
            periodMonth: 8,
        },
    }),
}));

import { calculateCommissionAction } from '../sales-commission';
import { requireSalesFinance } from '@/lib/auth/sales-access';
import { calculateCommission } from '@/services/sales/commission-service';

describe('sales-commission actions — guard FINANCE+ADMIN (data finansial sensitif)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireSalesFinance).mockResolvedValue({
            user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
        } as any);
        vi.mocked(calculateCommission).mockResolvedValue({
            entries: [],
            unattributed: new Decimal(0),
            unattributedPaidRevenue: new Decimal(0),
            scheme: null,
            warnings: [],
            period: {
                from: new Date('2026-08-01'),
                to: new Date('2026-08-31'),
                periodYear: 2026,
                periodMonth: 8,
            },
        } as never);
    });

    it('ADMIN lolos guard', async () => {
        vi.mocked(requireSalesFinance).mockResolvedValue({
            user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
        } as any);
        const res = await calculateCommissionAction({
            from: '2026-08-01',
            to: '2026-08-31',
        });
        expect(res!.success).toBe(true);
        expect(requireSalesFinance).toHaveBeenCalled();
        expect(calculateCommission).toHaveBeenCalled();
    });

    it('FINANCE lolos guard', async () => {
        vi.mocked(requireSalesFinance).mockResolvedValue({
            user: { id: 'fin-1', role: 'FINANCE', roles: ['FINANCE'] },
        } as any);
        const res = await calculateCommissionAction({
            from: '2026-08-01',
            to: '2026-08-31',
        });
        expect(res!.success).toBe(true);
    });

    it('SALES ditolak (bukan FINANCE/ADMIN)', async () => {
        vi.mocked(requireSalesFinance).mockRejectedValue(
            new Error('Unauthorized: Akses finance sales hanya untuk admin atau finance.'),
        );
        const res = await calculateCommissionAction({
            from: '2026-08-01',
            to: '2026-08-31',
        });
        expect(res!.success).toBe(false);
        expect((res as { error: string }).error).toMatch(/finance/i);
        expect(calculateCommission).not.toHaveBeenCalled();
    });

    it('MARKETING ditolak (bukan FINANCE/ADMIN)', async () => {
        vi.mocked(requireSalesFinance).mockRejectedValue(
            new Error('Unauthorized: Akses finance sales hanya untuk admin atau finance.'),
        );
        const res = await calculateCommissionAction({
            from: '2026-08-01',
            to: '2026-08-31',
        });
        expect(res!.success).toBe(false);
    });

    it('WAREHOUSE ditolak', async () => {
        vi.mocked(requireSalesFinance).mockRejectedValue(
            new Error('Unauthorized'),
        );
        const res = await calculateCommissionAction({
            from: '2026-08-01',
            to: '2026-08-31',
        });
        expect(res!.success).toBe(false);
    });

    it('validasi from > to ditolak', async () => {
        const res = await calculateCommissionAction({
            from: '2026-09-01',
            to: '2026-08-01',
        });
        expect(res!.success).toBe(false);
        expect((res as { error: string }).error).toMatch(/from.*<=.*to/i);
    });

    it('validasi from invalid ditolak', async () => {
        const res = await calculateCommissionAction({
            from: 'not-a-date' as never,
            to: '2026-08-31',
        });
        expect(res!.success).toBe(false);
    });

    it('accepts Date objects (bukan hanya string)', async () => {
        const res = await calculateCommissionAction({
            from: new Date('2026-08-01'),
            to: new Date('2026-08-31'),
        } as never);
        expect(res!.success).toBe(true);
    });

    it('passes userId filter ke service jika diisi', async () => {
        await calculateCommissionAction({
            from: '2026-08-01',
            to: '2026-08-31',
            userId: 'u-123',
        });
        const call = vi.mocked(calculateCommission).mock.calls[0][0] as any;
        expect(call.userId).toBe('u-123');
    });
});
