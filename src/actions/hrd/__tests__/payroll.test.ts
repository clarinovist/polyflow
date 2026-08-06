import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEmployeeWeeklyPayroll, getAllWeeklyPayroll } from '../payroll';
import { requireHrdFinance } from '@/lib/auth/hrd-access';
import { PayrollService } from '@/services/hrd/payroll-service';
import { BusinessRuleError } from '@/lib/errors/errors';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: any) => fn,
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {},
}));

vi.mock('@/lib/auth/hrd-access', () => ({
    requireHrdFinance: vi.fn(),
}));

vi.mock('@/services/hrd/payroll-service', () => ({
    PayrollService: {
        getWeeklyPayroll: vi.fn(),
        getWeeklyPayrollForAll: vi.fn(),
    },
}));

describe('payroll action — HRD/Finance gate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getEmployeeWeeklyPayroll', () => {
        it('returns a failure response when requireHrdFinance rejects', async () => {
            vi.mocked(requireHrdFinance).mockRejectedValue(
                new BusinessRuleError('Unauthorized'),
            );

            const res = await getEmployeeWeeklyPayroll('emp-1');

            expect(res.success).toBe(false);
            expect(PayrollService.getWeeklyPayroll).not.toHaveBeenCalled();
        });

        it('calls PayrollService when requireHrdFinance resolves', async () => {
            vi.mocked(requireHrdFinance).mockResolvedValue({
                user: { id: 'hrd-1', role: 'HRD' },
            } as any);
            vi.mocked(PayrollService.getWeeklyPayroll).mockResolvedValue({
                total: 0,
            } as any);

            const res = await getEmployeeWeeklyPayroll('emp-1');

            expect(res.success).toBe(true);
            expect(PayrollService.getWeeklyPayroll).toHaveBeenCalled();
        });
    });

    describe('getAllWeeklyPayroll', () => {
        it('returns a failure response when requireHrdFinance rejects', async () => {
            vi.mocked(requireHrdFinance).mockRejectedValue(
                new BusinessRuleError('Unauthorized'),
            );

            const res = await getAllWeeklyPayroll();

            expect(res.success).toBe(false);
            expect(
                PayrollService.getWeeklyPayrollForAll,
            ).not.toHaveBeenCalled();
        });

        it('calls PayrollService when requireHrdFinance resolves', async () => {
            vi.mocked(requireHrdFinance).mockResolvedValue({
                user: { id: 'finance-1', role: 'FINANCE' },
            } as any);
            vi.mocked(
                PayrollService.getWeeklyPayrollForAll,
            ).mockResolvedValue([] as any);

            const res = await getAllWeeklyPayroll();

            expect(res.success).toBe(true);
            expect(PayrollService.getWeeklyPayrollForAll).toHaveBeenCalled();
        });
    });
});
