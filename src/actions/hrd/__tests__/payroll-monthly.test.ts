import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    finalizePayslip,
    unfinalizePayslip,
    recordLoanPayment,
    generatePayslips,
    markPayslipPaid,
    closePayrollPeriod,
    getPayslipAttendanceBasis,
    recomputePayslipProration,
} from '../payroll-monthly';
import { requireHrdApprover, requireHrdFinance } from '@/lib/auth/hrd-access';
import { logActivity } from '@/lib/tools/audit';
import {
    EmployeeLoanService,
    PayrollMonthlyService,
} from '@/services/hrd/payroll-monthly-service';
import { BusinessRuleError } from '@/lib/errors/errors';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: unknown) => fn,
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: { marker: 'root-prisma' },
}));

vi.mock('@/lib/auth/hrd-access', () => ({
    requireHrdApprover: vi.fn(),
    requireHrdFinance: vi.fn(),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('@/services/hrd/payroll-monthly-service', () => ({
    EmployeeLoanService: {
        getPortfolioSummary: vi.fn(),
        list: vi.fn(),
        create: vi.fn(),
        markDefaulted: vi.fn(),
        recordPayment: vi.fn(),
    },
    EmployeeAllowanceService: {
        list: vi.fn(),
        replaceForEmployee: vi.fn(),
    },
    PayrollMonthlyService: {
        listPeriods: vi.fn(),
        generateDrafts: vi.fn(),
        listPayslips: vi.fn(),
        updateDraft: vi.fn(),
        finalize: vi.fn(),
        markPaid: vi.fn(),
        unfinalize: vi.fn(),
        closePeriod: vi.fn(),
        getAttendanceBasis: vi.fn(),
        recomputeDraftProration: vi.fn(),
    },
}));

const USER_ID = 'user-1';
const SESSION = { user: { id: USER_ID, role: 'HRD' } };

type OnCommit = (
    tx: unknown,
    facts: Record<string, unknown>,
) => Promise<void>;
interface ServiceOptions {
    onCommit?: OnCommit;
}

const FINALIZE_FACTS = {
    employeeId: 'emp-1',
    netPay: 3500000,
    loanDeduction: 250000,
    allocations: [
        { loanId: 'loan-1', loanNumber: 'KSB-2026-0001', amount: 250000 },
    ],
};

const LOAN_PAYMENT_FACTS = {
    paymentAmount: 100000,
    loanNumber: 'KSB-2026-0001',
    employeeCode: 'E001',
    employeeName: 'Karyawan Uji',
    remainingBalance: 400000,
    status: 'ACTIVE',
};

const GENERATE_FACTS = {
    periodId: 'per-1',
    year: 2026,
    month: 10,
    created: 3,
    skipped: 1,
};

const RECOMPUTE_FACTS = {
    employeeId: 'emp-1',
    absentDays: 2,
    deductibleLeaveDays: 1,
    previousProration: 100000,
    prorationDeduction: 350000,
};

const ATTENDANCE_BASIS = {
    payslipId: 'ps-1',
    employeeId: 'emp-1',
    periodYear: 2026,
    periodMonth: 10,
    dailyRate: 120000,
    workingDays: 26,
    absentDays: 2,
    deductibleLeaveDays: 1,
    paidLeaveDays: 3,
    missingDays: 4,
    unlinkedLeaveDays: 0,
};

const fakeTx = {
    payslip: { findUnique: vi.fn() },
    employeeLoan: { findUnique: vi.fn() },
    payrollPeriod: { findUnique: vi.fn() },
};

/** Index of the `options` argument for each service method under test. */
function optionsOf(mock: unknown, index: number): ServiceOptions | undefined {
    const calls = vi.mocked(mock as (...a: unknown[]) => unknown).mock.calls;
    return calls[0]?.[index] as ServiceOptions | undefined;
}

/**
 * Simulates a service: runs the data change, then onCommit inside the "tx",
 * and only marks data as committed when onCommit succeeds.
 */
function simulateService<T>(
    result: T,
    factsToPass: Record<string, unknown>,
    optionsIndex: number,
) {
    const state = { committed: false };
    const impl = async (...args: unknown[]) => {
        const options = args[optionsIndex] as ServiceOptions | undefined;
        if (options?.onCommit) await options.onCommit(fakeTx, factsToPass);
        state.committed = true;
        return result;
    };
    return { state, impl };
}

describe('payroll-monthly actions — audit di dalam transaksi', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(requireHrdApprover).mockResolvedValue(SESSION as never);
        vi.mocked(requireHrdFinance).mockResolvedValue(SESSION as never);
        vi.mocked(logActivity).mockResolvedValue(undefined);
    });

    afterEach(() => {
        expect(fakeTx.payslip.findUnique).not.toHaveBeenCalled();
        expect(fakeTx.employeeLoan.findUnique).not.toHaveBeenCalled();
        expect(fakeTx.payrollPeriod.findUnique).not.toHaveBeenCalled();
    });

    describe('finalizePayslip', () => {
        it('passes onCommit that audits with tx and session user, no post-commit log', async () => {
            const { impl } = simulateService(
                { id: 'ps-1' },
                FINALIZE_FACTS,
                2,
            );
            vi.mocked(PayrollMonthlyService.finalize).mockImplementation(
                impl as never,
            );

            const res = await finalizePayslip('ps-1');

            expect(res.success).toBe(true);
            expect(logActivity).toHaveBeenCalledTimes(1);
            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: USER_ID,
                    action: 'PAYSLIP_FINALIZED',
                    entityType: 'Payslip',
                    entityId: 'ps-1',
                    details:
                        'Finalized payslip for employee=emp-1, netPay=3500000; 1 loan allocation(s)',
                    changes: { allocations: FINALIZE_FACTS.allocations },
                    tx: fakeTx,
                }),
            );
        });

        it('aborts without writing a half audit when a required fact is missing', async () => {
            const { state, impl } = simulateService(
                { id: 'ps-1' },
                { employeeId: 'emp-1' },
                2,
            );
            vi.mocked(PayrollMonthlyService.finalize).mockImplementation(
                impl as never,
            );

            const res = await finalizePayslip('ps-1');

            expect(res.success).toBe(false);
            expect(logActivity).not.toHaveBeenCalled();
            expect(state.committed).toBe(false);
        });

        it('forwards options as the last argument of the service call', async () => {
            vi.mocked(PayrollMonthlyService.finalize).mockResolvedValue({
                id: 'ps-1',
            } as never);

            await finalizePayslip('ps-1');

            const options = optionsOf(PayrollMonthlyService.finalize, 2);
            expect(typeof options?.onCommit).toBe('function');
            expect(logActivity).not.toHaveBeenCalled();
        });

        it('returns error and does not commit when audit fails inside the tx', async () => {
            const { state, impl } = simulateService(
                { id: 'ps-1' },
                FINALIZE_FACTS,
                2,
            );
            vi.mocked(PayrollMonthlyService.finalize).mockImplementation(
                impl as never,
            );
            vi.mocked(logActivity).mockRejectedValue(new Error('audit down'));

            const res = await finalizePayslip('ps-1');

            expect(res.success).toBe(false);
            expect(state.committed).toBe(false);
        });

        it('rejects when role is not an approver', async () => {
            vi.mocked(requireHrdApprover).mockRejectedValue(
                new BusinessRuleError('Unauthorized'),
            );

            const res = await finalizePayslip('ps-1');

            expect(res.success).toBe(false);
            expect(PayrollMonthlyService.finalize).not.toHaveBeenCalled();
        });
    });

    describe('unfinalizePayslip', () => {
        const reversedPayments = [
            {
                loanId: 'loan-1',
                loanNumber: 'KSB-2026-0001',
                amount: 250000,
                date: '2026-10-31T00:00:00.000Z',
            },
        ];

        it('records reversedPayments from facts in the audit changes', async () => {
            const { impl } = simulateService(
                { id: 'ps-1', employeeId: 'emp-1' },
                { employeeId: 'emp-1', reversedPayments },
                2,
            );
            vi.mocked(PayrollMonthlyService.unfinalize).mockImplementation(
                impl as never,
            );

            const res = await unfinalizePayslip('ps-1');

            expect(res.success).toBe(true);
            expect(logActivity).toHaveBeenCalledTimes(1);
            const call = vi.mocked(logActivity).mock.calls[0][0];
            expect(call).toMatchObject({
                userId: USER_ID,
                action: 'PAYSLIP_UNFINALIZED',
                entityType: 'Payslip',
                entityId: 'ps-1',
                tx: fakeTx,
            });
            expect(call.details).toContain('Un-finalized payslip');
            expect(call.details).toContain('employee=emp-1');
            expect(call.changes).toEqual({ reversedPayments });
        });

        it('records an empty reversedPayments list when none were reversed', async () => {
            const { impl } = simulateService(
                { id: 'ps-1' },
                { employeeId: 'emp-1', reversedPayments: [] },
                2,
            );
            vi.mocked(PayrollMonthlyService.unfinalize).mockImplementation(
                impl as never,
            );

            await unfinalizePayslip('ps-1');

            const call = vi.mocked(logActivity).mock.calls[0][0];
            expect(call.changes).toEqual({ reversedPayments: [] });
        });

        it('aborts when reversedPayments fact is missing', async () => {
            const { state, impl } = simulateService(
                { id: 'ps-1' },
                { employeeId: 'emp-1' },
                2,
            );
            vi.mocked(PayrollMonthlyService.unfinalize).mockImplementation(
                impl as never,
            );

            const res = await unfinalizePayslip('ps-1');

            expect(res.success).toBe(false);
            expect(logActivity).not.toHaveBeenCalled();
            expect(state.committed).toBe(false);
        });

        it('returns error and does not commit when audit fails', async () => {
            const { state, impl } = simulateService(
                { id: 'ps-1' },
                { employeeId: 'emp-1', reversedPayments },
                2,
            );
            vi.mocked(PayrollMonthlyService.unfinalize).mockImplementation(
                impl as never,
            );
            vi.mocked(logActivity).mockRejectedValue(new Error('audit down'));

            const res = await unfinalizePayslip('ps-1');

            expect(res.success).toBe(false);
            expect(state.committed).toBe(false);
        });
    });

    describe('recordLoanPayment', () => {
        const data = { amount: 100000, date: new Date('2026-10-15') };

        it('audits inside the tx with loan details and no post-commit log', async () => {
            const { impl } = simulateService(
                { loan: { id: 'loan-1' }, payment: { amount: 100000 } },
                LOAN_PAYMENT_FACTS,
                3,
            );
            vi.mocked(EmployeeLoanService.recordPayment).mockImplementation(
                impl as never,
            );

            const res = await recordLoanPayment('loan-1', data);

            expect(res.success).toBe(true);
            expect(logActivity).toHaveBeenCalledTimes(1);
            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: USER_ID,
                    action: 'LOAN_PAYMENT_RECORDED',
                    entityType: 'EmployeeLoan',
                    entityId: 'loan-1',
                    details:
                        'Manual payment 100000 on KSB-2026-0001 (E001 — Karyawan Uji); remaining=400000, status=ACTIVE',
                    tx: fakeTx,
                }),
            );
        });

        it('passes a Date built from the input to the service', async () => {
            vi.mocked(EmployeeLoanService.recordPayment).mockResolvedValue({
                loan: {},
                payment: {},
            } as never);

            await recordLoanPayment('loan-1', {
                amount: 100000,
                date: '2026-10-15' as unknown as Date,
            });

            const passed = vi.mocked(EmployeeLoanService.recordPayment).mock
                .calls[0][2];
            expect(passed.date).toBeInstanceOf(Date);
            expect(passed.date.toISOString()).toContain('2026-10-15');
        });

        it('rejects an Invalid Date before touching the service', async () => {
            const res = await recordLoanPayment('loan-1', {
                amount: 100000,
                date: 'bukan-tanggal' as unknown as Date,
            });

            expect(res.success).toBe(false);
            if (!res.success) expect(res.error).toMatch(/tanggal/i);
            expect(EmployeeLoanService.recordPayment).not.toHaveBeenCalled();
        });

        it.each([NaN, Infinity, -Infinity])(
            'rejects non-finite amount %s',
            async (amount) => {
                const res = await recordLoanPayment('loan-1', {
                    ...data,
                    amount,
                });

                expect(res.success).toBe(false);
                expect(
                    EmployeeLoanService.recordPayment,
                ).not.toHaveBeenCalled();
            },
        );

        it('rejects zero or negative amount', async () => {
            const res = await recordLoanPayment('loan-1', {
                ...data,
                amount: -5,
            });

            expect(res.success).toBe(false);
            expect(EmployeeLoanService.recordPayment).not.toHaveBeenCalled();
        });

        it('returns error and does not commit when audit fails', async () => {
            const { state, impl } = simulateService(
                {},
                LOAN_PAYMENT_FACTS,
                3,
            );
            vi.mocked(EmployeeLoanService.recordPayment).mockImplementation(
                impl as never,
            );
            vi.mocked(logActivity).mockRejectedValue(new Error('audit down'));

            const res = await recordLoanPayment('loan-1', data);

            expect(res.success).toBe(false);
            expect(state.committed).toBe(false);
        });

        it('aborts when loan facts are incomplete', async () => {
            const { state, impl } = simulateService(
                {},
                { paymentAmount: 100000 },
                3,
            );
            vi.mocked(EmployeeLoanService.recordPayment).mockImplementation(
                impl as never,
            );

            const res = await recordLoanPayment('loan-1', data);

            expect(res.success).toBe(false);
            expect(logActivity).not.toHaveBeenCalled();
            expect(state.committed).toBe(false);
        });

        it('rejects when role is not an approver', async () => {
            vi.mocked(requireHrdApprover).mockRejectedValue(
                new BusinessRuleError('Unauthorized'),
            );

            const res = await recordLoanPayment('loan-1', data);

            expect(res.success).toBe(false);
            expect(EmployeeLoanService.recordPayment).not.toHaveBeenCalled();
        });
    });

    describe('generatePayslips', () => {
        it('audits inside the tx using facts for counts and no post-commit log', async () => {
            const { impl } = simulateService(
                { created: 3, skipped: 1, periodId: 'per-1' },
                GENERATE_FACTS,
                2,
            );
            vi.mocked(PayrollMonthlyService.generateDrafts).mockImplementation(
                impl as never,
            );

            const res = await generatePayslips({ year: 2026, month: 10 });

            expect(res.success).toBe(true);
            expect(logActivity).toHaveBeenCalledTimes(1);
            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: USER_ID,
                    action: 'PAYROLL_GENERATED',
                    entityType: 'PayrollPeriod',
                    entityId: 'per-1',
                    details:
                        'Generated 3 payslips (1 skipped) for 2026-10',
                    tx: fakeTx,
                }),
            );
        });

        it('aborts when generation facts are incomplete', async () => {
            const { state, impl } = simulateService(
                {},
                { periodId: 'per-1' },
                2,
            );
            vi.mocked(PayrollMonthlyService.generateDrafts).mockImplementation(
                impl as never,
            );

            const res = await generatePayslips({ year: 2026, month: 10 });

            expect(res.success).toBe(false);
            expect(logActivity).not.toHaveBeenCalled();
            expect(state.committed).toBe(false);
        });

        it.each([
            { year: 2026, month: 13 },
            { year: 2026, month: 0 },
            { year: NaN, month: 5 },
            { year: 2026, month: 1.5 },
            { year: 2026, month: Infinity },
        ])('rejects invalid period %j', async (input) => {
            const res = await generatePayslips(input);

            expect(res.success).toBe(false);
            expect(PayrollMonthlyService.generateDrafts).not.toHaveBeenCalled();
        });

        it('returns warnings from the service to the client alongside the other fields', async () => {
            const warnings = [
                { employeeId: 'emp-1', employeeName: 'Budi Uji', missingDays: 3 },
            ];
            vi.mocked(PayrollMonthlyService.generateDrafts).mockResolvedValue({
                created: 3,
                skipped: 1,
                periodId: 'per-1',
                warnings,
            } as never);

            const res = await generatePayslips({ year: 2026, month: 10 });

            expect(res.success).toBe(true);
            expect(res.success && res.data).toEqual({
                created: 3,
                skipped: 1,
                periodId: 'per-1',
                warnings,
            });
        });

        it('returns error and does not commit when audit fails', async () => {
            const { state, impl } = simulateService({}, GENERATE_FACTS, 2);
            vi.mocked(PayrollMonthlyService.generateDrafts).mockImplementation(
                impl as never,
            );
            vi.mocked(logActivity).mockRejectedValue(new Error('audit down'));

            const res = await generatePayslips({ year: 2026, month: 10 });

            expect(res.success).toBe(false);
            expect(state.committed).toBe(false);
        });
    });

    describe('markPayslipPaid', () => {
        it('audits inside the tx and does not log after the service returns', async () => {
            const { impl } = simulateService(
                { id: 'ps-1' },
                { employeeId: 'emp-1' },
                2,
            );
            vi.mocked(PayrollMonthlyService.markPaid).mockImplementation(
                impl as never,
            );

            const res = await markPayslipPaid('ps-1');

            expect(res.success).toBe(true);
            expect(requireHrdFinance).toHaveBeenCalled();
            expect(logActivity).toHaveBeenCalledTimes(1);
            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: USER_ID,
                    action: 'PAYSLIP_PAID',
                    entityType: 'Payslip',
                    entityId: 'ps-1',
                    details: 'Marked payslip PAID for employee=emp-1',
                    tx: fakeTx,
                }),
            );
        });

        it('returns error and does not commit when audit fails', async () => {
            const { state, impl } = simulateService(
                {},
                { employeeId: 'emp-1' },
                2,
            );
            vi.mocked(PayrollMonthlyService.markPaid).mockImplementation(
                impl as never,
            );
            vi.mocked(logActivity).mockRejectedValue(new Error('audit down'));

            const res = await markPayslipPaid('ps-1');

            expect(res.success).toBe(false);
            expect(state.committed).toBe(false);
        });

        it('rejects when role is not allowed', async () => {
            vi.mocked(requireHrdFinance).mockRejectedValue(
                new BusinessRuleError('Unauthorized'),
            );

            const res = await markPayslipPaid('ps-1');

            expect(res.success).toBe(false);
            expect(PayrollMonthlyService.markPaid).not.toHaveBeenCalled();
        });
    });

    describe('closePayrollPeriod', () => {
        it('audits inside the tx using the period facts', async () => {
            const { impl } = simulateService(
                { id: 'per-1', year: 2026, month: 10 },
                { year: 2026, month: 10, closedById: USER_ID },
                3,
            );
            vi.mocked(PayrollMonthlyService.closePeriod).mockImplementation(
                impl as never,
            );

            const res = await closePayrollPeriod('per-1');

            expect(res.success).toBe(true);
            expect(
                vi.mocked(PayrollMonthlyService.closePeriod).mock.calls[0].slice(
                    0,
                    3,
                ),
            ).toEqual([{ marker: 'root-prisma' }, 'per-1', USER_ID]);
            expect(logActivity).toHaveBeenCalledTimes(1);
            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: USER_ID,
                    action: 'PAYROLL_PERIOD_CLOSED',
                    entityType: 'PayrollPeriod',
                    entityId: 'per-1',
                    details: 'Closed payroll period 2026-10',
                    tx: fakeTx,
                }),
            );
        });

        it('returns error and does not commit when audit fails', async () => {
            const { state, impl } = simulateService(
                {},
                { year: 2026, month: 10, closedById: USER_ID },
                3,
            );
            vi.mocked(PayrollMonthlyService.closePeriod).mockImplementation(
                impl as never,
            );
            vi.mocked(logActivity).mockRejectedValue(new Error('audit down'));

            const res = await closePayrollPeriod('per-1');

            expect(res.success).toBe(false);
            expect(state.committed).toBe(false);
        });
    });

    describe('getPayslipAttendanceBasis', () => {
        it('forwards the service result and reads with the root client', async () => {
            vi.mocked(PayrollMonthlyService.getAttendanceBasis).mockResolvedValue(
                ATTENDANCE_BASIS as never,
            );

            const res = await getPayslipAttendanceBasis('ps-1');

            expect(res.success).toBe(true);
            expect(res.success && res.data).toEqual(ATTENDANCE_BASIS);
            expect(PayrollMonthlyService.getAttendanceBasis).toHaveBeenCalledWith(
                { marker: 'root-prisma' },
                'ps-1',
            );
            expect(requireHrdFinance).toHaveBeenCalledTimes(1);
        });

        it('rejects when the role is not allowed', async () => {
            vi.mocked(requireHrdFinance).mockRejectedValue(
                new BusinessRuleError('Unauthorized'),
            );

            const res = await getPayslipAttendanceBasis('ps-1');

            expect(res.success).toBe(false);
            expect(PayrollMonthlyService.getAttendanceBasis).not.toHaveBeenCalled();
        });

        it('returns an error when the service fails (not an empty success)', async () => {
            vi.mocked(PayrollMonthlyService.getAttendanceBasis).mockRejectedValue(
                new BusinessRuleError('Payslip tidak ditemukan'),
            );

            const res = await getPayslipAttendanceBasis('ps-x');

            expect(res.success).toBe(false);
        });
    });

    describe('recomputePayslipProration', () => {
        it('audits inside the tx with old and new deduction and no post-commit log', async () => {
            const { impl } = simulateService(
                { id: 'ps-1' },
                RECOMPUTE_FACTS,
                2,
            );
            vi.mocked(
                PayrollMonthlyService.recomputeDraftProration,
            ).mockImplementation(impl as never);

            const res = await recomputePayslipProration('ps-1');

            expect(res.success).toBe(true);
            expect(logActivity).toHaveBeenCalledTimes(1);
            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: USER_ID,
                    action: 'PAYSLIP_PRORATION_RECOMPUTED',
                    entityType: 'Payslip',
                    entityId: 'ps-1',
                    details:
                        'Recomputed attendance proration for employee=emp-1: 100000 -> 350000 (absent=2, unpaidLeave=1)',
                    changes: {
                        previousProration: 100000,
                        prorationDeduction: 350000,
                        absentDays: 2,
                        deductibleLeaveDays: 1,
                    },
                    tx: fakeTx,
                }),
            );
        });

        it('passes the root client, payslip id and onCommit to the service', async () => {
            vi.mocked(
                PayrollMonthlyService.recomputeDraftProration,
            ).mockResolvedValue({ id: 'ps-1' } as never);

            await recomputePayslipProration('ps-1');

            const call = vi.mocked(PayrollMonthlyService.recomputeDraftProration)
                .mock.calls[0];
            expect(call.slice(0, 2)).toEqual([{ marker: 'root-prisma' }, 'ps-1']);
            expect(typeof optionsOf(PayrollMonthlyService.recomputeDraftProration, 2)?.onCommit).toBe('function');
            expect(logActivity).not.toHaveBeenCalled();
        });

        it.each(['employeeId', 'absentDays', 'deductibleLeaveDays', 'previousProration', 'prorationDeduction'])(
            'aborts without a half audit when fact %s is missing',
            async (missing) => {
                const facts: Record<string, unknown> = { ...RECOMPUTE_FACTS };
                delete facts[missing];
                const { state, impl } = simulateService({ id: 'ps-1' }, facts, 2);
                vi.mocked(
                    PayrollMonthlyService.recomputeDraftProration,
                ).mockImplementation(impl as never);

                const res = await recomputePayslipProration('ps-1');

                expect(res.success).toBe(false);
                expect(logActivity).not.toHaveBeenCalled();
                expect(state.committed).toBe(false);
            },
        );

        it('returns error and does not commit when audit fails inside the tx', async () => {
            const { state, impl } = simulateService(
                { id: 'ps-1' },
                RECOMPUTE_FACTS,
                2,
            );
            vi.mocked(
                PayrollMonthlyService.recomputeDraftProration,
            ).mockImplementation(impl as never);
            vi.mocked(logActivity).mockRejectedValue(new Error('audit down'));

            const res = await recomputePayslipProration('ps-1');

            expect(res.success).toBe(false);
            expect(state.committed).toBe(false);
        });

        it('rejects when role is not an approver', async () => {
            vi.mocked(requireHrdApprover).mockRejectedValue(
                new BusinessRuleError('Unauthorized'),
            );

            const res = await recomputePayslipProration('ps-1');

            expect(res.success).toBe(false);
            expect(
                PayrollMonthlyService.recomputeDraftProration,
            ).not.toHaveBeenCalled();
        });
    });
});
