import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {},
}));

vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesAccess: vi.fn().mockResolvedValue({
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
                const err = e as any;
                return {
                    success: false,
                    error: err.message ?? String(err),
                    code: err.code ?? 'UNKNOWN',
                };
            }
        },
    };
});

vi.mock('@/services/sales/field-scope', () => ({
    getFieldSalesScope: vi.fn().mockReturnValue({
        actorUserId: 'admin',
        isGlobalViewer: true,
    }),
}));

vi.mock('@/services/sales/customer-activity-service', () => ({
    getCustomerActivityReport: vi.fn().mockResolvedValue({
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-31'),
        dormantThresholdDays: 60,
        summary: {
            dormantCount: 2,
            newCount: 1,
            lostCount: 0,
            totalCustomersInScope: 10,
        },
        dormantCustomers: [],
        newCustomers: [],
        lostCustomers: [],
    }),
}));

import {
    getSalesCustomerActivityReport,
} from '../customer-activity-report';
import { requireSalesAccess } from '@/lib/auth/sales-access';
import { getCustomerActivityReport } from '@/services/sales/customer-activity-service';
import { getFieldSalesScope } from '@/services/sales/field-scope';
import { BusinessRuleError } from '@/lib/errors/errors';

describe('customer-activity-report action — guard ADMIN|SALES|MARKETING only', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireSalesAccess).mockResolvedValue({
            user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
        } as any);
    });

    it('ADMIN lolos guard dan mengembalikan data', async () => {
        const result = await getSalesCustomerActivityReport(
            new Date('2026-08-01'),
            new Date('2026-08-31'),
        );

        expect(result.success).toBe(true);
        expect(requireSalesAccess).toHaveBeenCalledTimes(1);
        expect(getCustomerActivityReport).toHaveBeenCalledTimes(1);
    });

    it('SALES lolos guard', async () => {
        vi.mocked(requireSalesAccess).mockResolvedValue({
            user: { id: 'sales-1', role: 'SALES', roles: ['SALES'] },
        } as any);

        const result = await getSalesCustomerActivityReport();
        expect(result.success).toBe(true);
        expect(requireSalesAccess).toHaveBeenCalledTimes(1);
    });

    it('MARKETING lolos guard', async () => {
        vi.mocked(requireSalesAccess).mockResolvedValue({
            user: { id: 'mkt-1', role: 'MARKETING', roles: ['MARKETING'] },
        } as any);

        const result = await getSalesCustomerActivityReport();
        expect(result.success).toBe(true);
        expect(requireSalesAccess).toHaveBeenCalledTimes(1);
    });

    it('FINANCE ditolak — requireSalesAccess throw BusinessRuleError', async () => {
        vi.mocked(requireSalesAccess).mockRejectedValue(
            new BusinessRuleError(
                'Unauthorized: Akses sales hanya untuk admin atau sales.',
            ),
        );

        const result = await getSalesCustomerActivityReport();
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain(
                'Akses sales hanya untuk admin atau sales',
            );
        }
    });

    it('WAREHOUSE ditolak', async () => {
        vi.mocked(requireSalesAccess).mockRejectedValue(
            new BusinessRuleError(
                'Unauthorized: Akses sales hanya untuk admin atau sales.',
            ),
        );

        const result = await getSalesCustomerActivityReport();
        expect(result.success).toBe(false);
    });

    it('passes scope from getFieldSalesScope to service', async () => {
        await getSalesCustomerActivityReport(
            new Date('2026-08-01'),
            new Date('2026-08-31'),
            60,
        );

        expect(getFieldSalesScope).toHaveBeenCalled();
        expect(getCustomerActivityReport).toHaveBeenCalledWith(
            expect.objectContaining({ actorUserId: 'admin', isGlobalViewer: true }),
            new Date('2026-08-01'),
            new Date('2026-08-31'),
            60,
        );
    });
});
