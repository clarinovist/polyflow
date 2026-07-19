import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    computePayslipAmounts,
    countMonToSat,
    nextDeductionAmount,
    isLoanDeductibleInPeriod,
    EmployeeLoanService,
    PayrollMonthlyService,
    yearMonthKey,
} from '../payroll-monthly-service';

function dec(n: number) {
    return { toNumber: () => n, valueOf: () => n, toString: () => String(n) } as any;
}

describe('pure helpers', () => {
    it('countMonToSat excludes Sundays', () => {
        // July 2026: 1 Wed … 31 Fri — 4 Sundays (5,12,19,26) → 31-4 = 27
        const start = new Date(Date.UTC(2026, 6, 1));
        const end = new Date(Date.UTC(2026, 6, 31));
        expect(countMonToSat(start, end)).toBe(27);
    });

    it('computePayslipAmounts follows plan formula', () => {
        const r = computePayslipAmounts({
            baseSalary: 5_000_000,
            allowanceTotal: 500_000,
            thrAmount: 1_000_000,
            prorationDeduction: 200_000,
            bpjsDeduction: 100_000,
            loanDeduction: 300_000,
            otherDeductions: 50_000,
        });
        expect(r.grossPay).toBe(6_500_000); // base + allowance + thr
        expect(r.deductionTotal).toBe(650_000); // bpjs+loan+other+prorata
        expect(r.netPay).toBe(5_850_000);
    });

    it('INSTALLMENT deduction caps at remaining', () => {
        expect(
            nextDeductionAmount({
                repaymentType: 'INSTALLMENT',
                installmentAmount: 500_000,
                remainingBalance: 200_000,
            }),
        ).toBe(200_000);
    });

    it('FULL_NEXT_MONTH only after next calendar month', () => {
        const loanDate = new Date(Date.UTC(2026, 6, 15)); // July
        expect(
            isLoanDeductibleInPeriod({ repaymentType: 'FULL_NEXT_MONTH', date: loanDate }, 2026, 7),
        ).toBe(false);
        expect(
            isLoanDeductibleInPeriod({ repaymentType: 'FULL_NEXT_MONTH', date: loanDate }, 2026, 8),
        ).toBe(true);
        expect(
            nextDeductionAmount(
                {
                    repaymentType: 'FULL_NEXT_MONTH',
                    installmentAmount: null,
                    remainingBalance: 1_000_000,
                    date: loanDate,
                },
                2026,
                7,
            ),
        ).toBe(0);
        expect(
            nextDeductionAmount(
                {
                    repaymentType: 'FULL_NEXT_MONTH',
                    installmentAmount: null,
                    remainingBalance: 1_000_000,
                    date: loanDate,
                },
                2026,
                8,
            ),
        ).toBe(1_000_000);
    });

    it('yearMonthKey orders months', () => {
        expect(yearMonthKey(2026, 8)).toBeGreaterThan(yearMonthKey(2026, 7));
    });
});

describe('EmployeeLoanService.create', () => {
    const mockDb = {
        employee: { findUnique: vi.fn() },
        employeeLoan: {
            findFirst: vi.fn(),
            create: vi.fn(),
        },
        $transaction: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) =>
            fn(mockDb),
        );
    });

    it('rejects second ACTIVE loan', async () => {
        mockDb.employee.findUnique.mockResolvedValue({ id: 'e1', name: 'Budi', code: 'EMP-1' });
        mockDb.employeeLoan.findFirst.mockResolvedValue({ id: 'l1', loanNumber: 'KSB-2026-0001' });

        await expect(
            EmployeeLoanService.create(mockDb as any, {
                employeeId: 'e1',
                date: new Date('2026-07-01T00:00:00Z'),
                principalAmount: 1_000_000,
                repaymentType: 'INSTALLMENT',
                installmentAmount: 200_000,
            }),
        ).rejects.toThrow(/kasbon aktif/i);
    });

    it('creates loan with generated number', async () => {
        mockDb.employee.findUnique.mockResolvedValue({ id: 'e1', name: 'Budi', code: 'EMP-1' });
        mockDb.employeeLoan.findFirst
            .mockResolvedValueOnce(null) // active check
            .mockResolvedValueOnce({ loanNumber: 'KSB-2026-0003' }); // next number
        mockDb.employeeLoan.create.mockResolvedValue({
            id: 'l-new',
            loanNumber: 'KSB-2026-0004',
            employee: { id: 'e1', name: 'Budi', code: 'EMP-1' },
        });

        const result = await EmployeeLoanService.create(mockDb as any, {
            employeeId: 'e1',
            date: new Date('2026-07-10T00:00:00Z'),
            principalAmount: 2_000_000,
            repaymentType: 'INSTALLMENT',
            installmentAmount: 500_000,
        });

        expect(result.loanNumber).toBe('KSB-2026-0004');
        expect(mockDb.employeeLoan.create).toHaveBeenCalled();
        const arg = mockDb.employeeLoan.create.mock.calls[0][0];
        expect(arg.data.loanNumber).toBe('KSB-2026-0004');
        expect(arg.data.remainingBalance).toBe(2_000_000);
    });
});

describe('PayrollMonthlyService.generateDrafts', () => {
    const mockDb = {
        payrollPeriod: { upsert: vi.fn() },
        employee: { findMany: vi.fn() },
        payslip: { findUnique: vi.fn(), create: vi.fn() },
        attendanceRecord: { count: vi.fn() },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockDb.payrollPeriod.upsert.mockResolvedValue({
            id: 'period-1',
            year: 2026,
            month: 7,
            status: 'OPEN',
        });
    });

    it('computes gross without subtracting prorata; bpjs only if participant', async () => {
        mockDb.employee.findMany.mockResolvedValue([
            {
                id: 'e1',
                monthlySalary: dec(5_200_000),
                bpjsParticipant: true,
                bpjsEmployeeDeduction: dec(100_000),
                allowances: [{ name: 'Transport', amount: dec(200_000) }],
                loans: [],
            },
        ]);
        mockDb.payslip.findUnique.mockResolvedValue(null);
        // 1 absent day; July 2026 has 27 Mon-Sat → daily ≈ 192592.59
        mockDb.attendanceRecord.count.mockResolvedValue(1);
        mockDb.payslip.create.mockResolvedValue({ id: 'ps1' });

        const result = await PayrollMonthlyService.generateDrafts(mockDb as any, {
            year: 2026,
            month: 7,
        });

        expect(result.created).toBe(1);
        const data = mockDb.payslip.create.mock.calls[0][0].data;
        expect(data.grossPay).toBe(5_400_000); // 5.2M + 200k, no prorata subtract
        expect(data.bpjsDeduction).toBe(100_000);
        expect(data.prorationDeduction).toBeGreaterThan(0);
        // deductionTotal is already round2'd in service
        expect(data.deductionTotal).toBe(
            Math.round((data.bpjsDeduction + data.loanDeduction + data.otherDeductions + data.prorationDeduction) * 100) / 100,
        );
        expect(data.netPay).toBe(Math.round((data.grossPay - data.deductionTotal) * 100) / 100);
    });

    it('skips bpjs when not participant', async () => {
        mockDb.employee.findMany.mockResolvedValue([
            {
                id: 'e2',
                monthlySalary: dec(4_000_000),
                bpjsParticipant: false,
                bpjsEmployeeDeduction: dec(100_000),
                allowances: [],
                loans: [],
            },
        ]);
        mockDb.payslip.findUnique.mockResolvedValue(null);
        mockDb.attendanceRecord.count.mockResolvedValue(0);
        mockDb.payslip.create.mockResolvedValue({ id: 'ps2' });

        await PayrollMonthlyService.generateDrafts(mockDb as any, { year: 2026, month: 7 });
        const data = mockDb.payslip.create.mock.calls[0][0].data;
        expect(data.bpjsDeduction).toBe(0);
        expect(data.grossPay).toBe(4_000_000);
        expect(data.netPay).toBe(4_000_000);
    });

    it('defers FULL_NEXT_MONTH loan to following month', async () => {
        mockDb.employee.findMany.mockResolvedValue([
            {
                id: 'e3',
                monthlySalary: dec(5_000_000),
                bpjsParticipant: false,
                bpjsEmployeeDeduction: null,
                allowances: [],
                loans: [
                    {
                        repaymentType: 'FULL_NEXT_MONTH',
                        installmentAmount: null,
                        remainingBalance: dec(1_000_000),
                        date: new Date(Date.UTC(2026, 6, 10)), // July
                    },
                ],
            },
        ]);
        mockDb.payslip.findUnique.mockResolvedValue(null);
        mockDb.attendanceRecord.count.mockResolvedValue(0);
        mockDb.payslip.create.mockResolvedValue({ id: 'ps3' });

        await PayrollMonthlyService.generateDrafts(mockDb as any, { year: 2026, month: 7 });
        expect(mockDb.payslip.create.mock.calls[0][0].data.loanDeduction).toBe(0);

        mockDb.payslip.create.mockClear();
        await PayrollMonthlyService.generateDrafts(mockDb as any, { year: 2026, month: 8 });
        // period upsert still OPEN
        expect(mockDb.payslip.create.mock.calls[0][0].data.loanDeduction).toBe(1_000_000);
    });
});

describe('PayrollMonthlyService.finalize & closePeriod', () => {
    it('finalize creates payment and marks PAID_OFF', async () => {
        const mockDb: any = {
            payslip: {
                findUnique: vi.fn().mockResolvedValue({
                    id: 'ps1',
                    status: 'DRAFT',
                    loanDeduction: dec(500_000),
                    employee: {
                        loans: [
                            {
                                id: 'loan1',
                                remainingBalance: dec(500_000),
                            },
                        ],
                    },
                }),
                update: vi.fn().mockResolvedValue({ id: 'ps1', status: 'FINALIZED', employeeId: 'e1', netPay: 0 }),
            },
            employeeLoanPayment: { create: vi.fn() },
            employeeLoan: { update: vi.fn() },
            $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(mockDb)),
        };

        await PayrollMonthlyService.finalize(mockDb, 'ps1');

        expect(mockDb.employeeLoanPayment.create).toHaveBeenCalled();
        expect(mockDb.employeeLoan.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ remainingBalance: 0, status: 'PAID_OFF' }),
            }),
        );
        expect(mockDb.payslip.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { status: 'FINALIZED' } }),
        );
    });

    it('closePeriod rejects unpaid payslips', async () => {
        const mockDb: any = {
            payrollPeriod: {
                findUnique: vi.fn().mockResolvedValue({
                    id: 'p1',
                    status: 'OPEN',
                    payslips: [
                        { id: 'a', status: 'PAID' },
                        { id: 'b', status: 'FINALIZED' },
                    ],
                }),
                update: vi.fn(),
            },
        };

        await expect(PayrollMonthlyService.closePeriod(mockDb, 'p1', 'user-1')).rejects.toThrow(
            /belum PAID/i,
        );
        expect(mockDb.payrollPeriod.update).not.toHaveBeenCalled();
    });
});

describe('PayrollMonthlyService.updateDraft', () => {
    it('recomputes net with thr and other deductions', async () => {
        const mockDb: any = {
            payslip: {
                findUnique: vi.fn().mockResolvedValue({
                    id: 'ps1',
                    status: 'DRAFT',
                    baseSalary: dec(5_000_000),
                    allowanceTotal: dec(0),
                    thrAmount: dec(0),
                    prorationDeduction: dec(0),
                    bpjsDeduction: dec(100_000),
                    loanDeduction: dec(0),
                    otherDeductions: dec(0),
                }),
                update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'ps1', ...data })),
            },
        };

        const result = await PayrollMonthlyService.updateDraft(mockDb, 'ps1', {
            thrAmount: 1_000_000,
            otherDeductions: 50_000,
        });

        expect(result.grossPay).toBe(6_000_000);
        expect(result.deductionTotal).toBe(150_000);
        expect(result.netPay).toBe(5_850_000);
    });

    it('rejects non-draft', async () => {
        const mockDb: any = {
            payslip: {
                findUnique: vi.fn().mockResolvedValue({ id: 'ps1', status: 'FINALIZED' }),
            },
        };
        await expect(PayrollMonthlyService.updateDraft(mockDb, 'ps1', { thrAmount: 1 })).rejects.toThrow(
            /DRAFT/i,
        );
    });
});
