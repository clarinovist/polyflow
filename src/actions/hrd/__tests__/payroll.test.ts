import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('payroll action — default week is the WIB current week', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.mocked(requireHrdFinance).mockResolvedValue({
            user: { id: 'hrd-1', role: 'HRD' },
        } as any);
        vi.mocked(PayrollService.getWeeklyPayroll).mockResolvedValue({} as any);
        vi.mocked(PayrollService.getWeeklyPayrollForAll).mockResolvedValue([] as any);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function weekStartKeyOfAllCall(): string {
        const [, weekStart] = vi.mocked(PayrollService.getWeeklyPayrollForAll).mock.calls[0];
        return (weekStart as Date).toISOString().slice(0, 10);
    }

    it.each([
        ['Monday 05:00 WIB (Sunday 22:00Z)', '2026-07-13', '2026-07-12T22:00:00.000Z'],
        ['Monday 08:00 WIB', '2026-07-13', '2026-07-13T01:00:00.000Z'],
        ['Sunday 23:30 WIB', '2026-07-13', '2026-07-19T16:30:00.000Z'],
    ])('getAllWeeklyPayroll without date at %s starts on %s', async (_label, expected, now) => {
        vi.setSystemTime(new Date(now));

        await getAllWeeklyPayroll();

        expect(weekStartKeyOfAllCall()).toBe(expected);
    });

    it('getEmployeeWeeklyPayroll without date at Monday 05:00 WIB uses the week starting that Monday', async () => {
        vi.setSystemTime(new Date('2026-07-12T22:00:00.000Z'));

        await getEmployeeWeeklyPayroll('emp-1');

        const [, , weekStart] = vi.mocked(PayrollService.getWeeklyPayroll).mock.calls[0];
        expect((weekStart as Date).toISOString().slice(0, 10)).toBe('2026-07-13');
    });

    it('explicit date is unchanged', async () => {
        vi.setSystemTime(new Date('2026-07-12T22:00:00.000Z'));

        await getAllWeeklyPayroll('2026-07-01');

        expect(weekStartKeyOfAllCall()).toBe('2026-06-29');
    });
});
