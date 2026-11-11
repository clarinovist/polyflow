import { describe, it, expect, vi } from 'vitest';
import {
    EmployeeAllowanceService,
    PayrollMonthlyService,
} from '../payroll-monthly-service';

function dec(n: number) {
    return { toNumber: () => n, valueOf: () => n, toString: () => String(n) } as any;
}

// Writes must go through the transaction client: `db` only exposes $transaction.
function makeTxDb() {
    const tx = {
        payslip: { updateMany: vi.fn(), findUnique: vi.fn() },
        payrollPeriod: { updateMany: vi.fn(), findUnique: vi.fn() },
        employeeLoan: { updateMany: vi.fn(), update: vi.fn() },
        employeeLoanPayment: { create: vi.fn(), delete: vi.fn() },
    };
    const db = {
        $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    return { tx, db };
}

// ─── finalize ───────────────────────────────────────

describe('PayrollMonthlyService.finalize', () => {
    const slip = (over: Record<string, unknown> = {}) => ({
        id: 'ps1',
        employeeId: 'e1',
        status: 'DRAFT',
        netPay: dec(4_500_000),
        loanDeduction: dec(500_000),
        employee: {
            id: 'e1',
            name: 'Budi',
            code: 'EMP-1',
            loans: [{ id: 'loan1', loanNumber: 'KSB-2026-0001', remainingBalance: dec(500_000) }],
        },
        ...over,
    });

    function setup(payslip: Record<string, unknown> = slip()) {
        const ctx = makeTxDb();
        ctx.tx.payslip.updateMany.mockResolvedValue({ count: 1 });
        ctx.tx.payslip.findUnique.mockResolvedValue(payslip);
        ctx.tx.employeeLoan.updateMany.mockResolvedValue({ count: 1 });
        ctx.tx.employeeLoanPayment.create.mockResolvedValue({ id: 'lp' });
        return ctx;
    }

    it('claims DRAFT→FINALIZED first, before reading the payslip or touching loans', async () => {
        const { db, tx } = setup();
        await PayrollMonthlyService.finalize(db as any, 'ps1');

        expect(tx.payslip.updateMany.mock.calls[0][0]).toEqual({
            where: { id: 'ps1', status: 'DRAFT' },
            data: { status: 'FINALIZED' },
        });
        const claim = tx.payslip.updateMany.mock.invocationCallOrder[0];
        expect(claim).toBeLessThan(tx.payslip.findUnique.mock.invocationCallOrder[0]);
        expect(claim).toBeLessThan(tx.employeeLoan.updateMany.mock.invocationCallOrder[0]);
    });

    it('lost claim: BusinessRuleError and no payment or decrement is made', async () => {
        const { db, tx } = setup();
        tx.payslip.updateMany.mockResolvedValue({ count: 0 });
        tx.payslip.findUnique.mockResolvedValue({ id: 'ps1', status: 'FINALIZED' });

        await expect(PayrollMonthlyService.finalize(db as any, 'ps1')).rejects.toThrow(
            /sudah difinalize/i,
        );
        expect(tx.employeeLoanPayment.create).not.toHaveBeenCalled();
        expect(tx.employeeLoan.updateMany).not.toHaveBeenCalled();
    });

    it('lost claim on a missing payslip → NotFoundError', async () => {
        const { db, tx } = setup();
        tx.payslip.updateMany.mockResolvedValue({ count: 0 });
        tx.payslip.findUnique.mockResolvedValue(null);
        await expect(PayrollMonthlyService.finalize(db as any, 'ps1')).rejects.toThrow(
            /tidak ditemukan/i,
        );
    });

    it('two parallel finalizes: only the winner creates payments / decrements', async () => {
        const { db, tx } = setup();
        let claims = 0;
        tx.payslip.updateMany.mockImplementation(async () => ({ count: claims++ === 0 ? 1 : 0 }));
        tx.payslip.findUnique
            .mockResolvedValueOnce(slip()) // winner reads payslip after claiming
            .mockResolvedValue({ id: 'ps1', status: 'FINALIZED' }); // loser explains the failure

        const results = await Promise.allSettled([
            PayrollMonthlyService.finalize(db as any, 'ps1'),
            PayrollMonthlyService.finalize(db as any, 'ps1'),
        ]);

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
        expect(tx.employeeLoanPayment.create).toHaveBeenCalledTimes(1);
        // one decrement + one conditional PAID_OFF, from the winner only
        expect(tx.employeeLoan.updateMany).toHaveBeenCalledTimes(2);
    });

    it('decrements atomically with a remainingBalance guard (no absolute overwrite) and records the payment', async () => {
        const { db, tx } = setup();
        await PayrollMonthlyService.finalize(db as any, 'ps1');

        expect(tx.employeeLoan.updateMany.mock.calls[0][0]).toEqual({
            where: { id: 'loan1', status: 'ACTIVE', remainingBalance: { gte: 500_000 } },
            data: { remainingBalance: { decrement: 500_000 } },
        });
        const pay = tx.employeeLoanPayment.create.mock.calls[0][0].data;
        expect(pay.loanId).toBe('loan1');
        expect(pay.payslipId).toBe('ps1');
        expect(pay.amount).toBe(500_000);
    });

    it('marks the loan PAID_OFF via a conditional update after the decrement', async () => {
        const { db, tx } = setup();
        await PayrollMonthlyService.finalize(db as any, 'ps1');
        expect(tx.employeeLoan.updateMany.mock.calls[1][0]).toEqual({
            where: { id: 'loan1', status: 'ACTIVE', remainingBalance: { lte: 0 } },
            data: { status: 'PAID_OFF' },
        });
    });

    it('splits across loans proportionally; total equals loanDeduction exactly', async () => {
        const { db, tx } = setup(
            slip({
                loanDeduction: dec(100_000),
                employee: {
                    id: 'e1',
                    name: 'Budi',
                    code: 'EMP-1',
                    loans: [
                        { id: 'a', loanNumber: 'KSB-1', remainingBalance: dec(300_000) },
                        { id: 'b', loanNumber: 'KSB-2', remainingBalance: dec(700_000) },
                    ],
                },
            }),
        );
        await PayrollMonthlyService.finalize(db as any, 'ps1');
        const amounts = tx.employeeLoanPayment.create.mock.calls.map((c: any) => c[0].data.amount);
        expect(amounts).toEqual([30_000, 70_000]);
        expect(amounts.reduce((s: number, x: number) => s + x, 0)).toBe(100_000);
    });

    it('insufficient allocation: throws and writes no payment and no decrement', async () => {
        const { db, tx } = setup(slip({ loanDeduction: dec(600_000) }));
        await expect(PayrollMonthlyService.finalize(db as any, 'ps1')).rejects.toThrow(
            /melebihi sisa kasbon aktif/i,
        );
        expect(tx.employeeLoanPayment.create).not.toHaveBeenCalled();
        expect(tx.employeeLoan.updateMany).not.toHaveBeenCalled();
    });

    it('deduction without any active loan is an error, not a silent skip', async () => {
        const { db, tx } = setup(
            slip({ employee: { id: 'e1', name: 'Budi', code: 'EMP-1', loans: [] } }),
        );
        await expect(PayrollMonthlyService.finalize(db as any, 'ps1')).rejects.toThrow(
            /melebihi sisa kasbon aktif/i,
        );
        expect(tx.employeeLoanPayment.create).not.toHaveBeenCalled();
    });

    it('a decrement that loses its guard (loan changed concurrently) aborts the whole finalize', async () => {
        const { db, tx } = setup(
            slip({
                loanDeduction: dec(100_000),
                employee: {
                    id: 'e1',
                    name: 'Budi',
                    code: 'EMP-1',
                    loans: [
                        { id: 'a', loanNumber: 'KSB-1', remainingBalance: dec(300_000) },
                        { id: 'b', loanNumber: 'KSB-2', remainingBalance: dec(700_000) },
                    ],
                },
            }),
        );
        tx.employeeLoan.updateMany
            .mockResolvedValueOnce({ count: 1 }) // a: decrement
            .mockResolvedValueOnce({ count: 1 }) // a: PAID_OFF check
            .mockResolvedValueOnce({ count: 0 }); // b: guard lost
        await expect(PayrollMonthlyService.finalize(db as any, 'ps1')).rejects.toThrow(
            /melebihi sisa kasbon aktif/i,
        );
        // b's payment must not exist; rejection of $transaction rolls back a's writes
        expect(tx.employeeLoanPayment.create).toHaveBeenCalledTimes(1);
    });

    it('zero deduction finalizes without touching loans', async () => {
        const { db, tx } = setup(slip({ loanDeduction: dec(0) }));
        const result = await PayrollMonthlyService.finalize(db as any, 'ps1');
        expect(result.status).toBe('FINALIZED');
        expect(tx.employeeLoan.updateMany).not.toHaveBeenCalled();
        expect(tx.employeeLoanPayment.create).not.toHaveBeenCalled();
    });

    it('returns the payslip with a minimal employee (no loans leaked)', async () => {
        const { db } = setup();
        const result = await PayrollMonthlyService.finalize(db as any, 'ps1');
        expect(result.employeeId).toBe('e1');
        expect(Number(result.netPay)).toBe(4_500_000);
        expect(result.employee).toEqual({ id: 'e1', name: 'Budi', code: 'EMP-1' });
    });

    it('calls onCommit inside the tx after loan writes, with facts; failure aborts', async () => {
        const { db, tx } = setup();
        const onCommit = vi.fn().mockResolvedValue(undefined);
        await PayrollMonthlyService.finalize(db as any, 'ps1', { onCommit });

        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit.mock.calls[0][0]).toBe(tx);
        expect(onCommit.mock.calls[0][1]).toMatchObject({
            employeeId: 'e1',
            loanDeduction: 500_000,
            allocations: [{ loanId: 'loan1', loanNumber: 'KSB-2026-0001', amount: 500_000 }],
        });
        expect(tx.employeeLoanPayment.create.mock.invocationCallOrder[0]).toBeLessThan(
            onCommit.mock.invocationCallOrder[0],
        );

        await expect(
            PayrollMonthlyService.finalize(db as any, 'ps1', {
                onCommit: vi.fn().mockRejectedValue(new Error('audit gagal')),
            }),
        ).rejects.toThrow('audit gagal');
    });

    it('does not call onCommit when the claim is lost', async () => {
        const { db, tx } = setup();
        tx.payslip.updateMany.mockResolvedValue({ count: 0 });
        tx.payslip.findUnique.mockResolvedValue({ id: 'ps1', status: 'PAID' });
        const onCommit = vi.fn();
        await expect(
            PayrollMonthlyService.finalize(db as any, 'ps1', { onCommit }),
        ).rejects.toThrow();
        expect(onCommit).not.toHaveBeenCalled();
    });
});

// ─── unfinalize ─────────────────────────────────────

describe('PayrollMonthlyService.unfinalize', () => {
    const payment = (over: Record<string, unknown> = {}) => ({
        id: 'lp1',
        amount: dec(500_000),
        date: new Date('2026-07-31T00:00:00Z'),
        loan: { id: 'loan1', loanNumber: 'KSB-2026-0001', remainingBalance: dec(0), status: 'PAID_OFF' },
        ...over,
    });
    const finalized = (payments = [payment()], periodStatus = 'OPEN') => ({
        id: 'ps1',
        employeeId: 'e1',
        status: 'FINALIZED',
        payrollPeriod: { status: periodStatus },
        loanPayments: payments,
    });

    function setup(payslip: Record<string, unknown> = finalized()) {
        const ctx = makeTxDb();
        ctx.tx.payslip.updateMany.mockResolvedValue({ count: 1 });
        ctx.tx.payslip.findUnique
            .mockResolvedValueOnce(payslip)
            .mockResolvedValue({
                id: 'ps1',
                status: 'DRAFT',
                employeeId: 'e1',
                employee: { id: 'e1', name: 'Budi', code: 'EMP-1' },
            });
        ctx.tx.employeeLoan.update.mockResolvedValue({});
        ctx.tx.employeeLoan.updateMany.mockResolvedValue({ count: 1 });
        ctx.tx.employeeLoanPayment.delete.mockResolvedValue({});
        return ctx;
    }

    it('claims FINALIZED→DRAFT atomically', async () => {
        const { db, tx } = setup();
        const result = await PayrollMonthlyService.unfinalize(db as any, 'ps1');
        expect(tx.payslip.updateMany.mock.calls[0][0]).toEqual({
            where: { id: 'ps1', status: 'FINALIZED' },
            data: { status: 'DRAFT' },
        });
        expect(result.status).toBe('DRAFT');
        expect(result.employeeId).toBe('e1');
    });

    it('restores the balance with increment (not an absolute value) and deletes the payment', async () => {
        const { db, tx } = setup();
        await PayrollMonthlyService.unfinalize(db as any, 'ps1');
        expect(tx.employeeLoan.update).toHaveBeenCalledWith({
            where: { id: 'loan1' },
            data: { remainingBalance: { increment: 500_000 } },
        });
        expect(tx.employeeLoanPayment.delete).toHaveBeenCalledWith({ where: { id: 'lp1' } });
    });

    it('reactivates PAID_OFF loans via a guarded update that never matches DEFAULTED', async () => {
        const { db, tx } = setup();
        await PayrollMonthlyService.unfinalize(db as any, 'ps1');
        expect(tx.employeeLoan.updateMany).toHaveBeenCalledWith({
            where: { id: 'loan1', status: 'PAID_OFF', remainingBalance: { gt: 0 } },
            data: { status: 'ACTIVE' },
        });
    });

    it('DEFAULTED loan: balance restored but status never written', async () => {
        const { db, tx } = setup(
            finalized([
                payment({
                    id: 'lp6',
                    amount: dec(200_000),
                    loan: { id: 'loan3', loanNumber: 'KSB-3', remainingBalance: dec(0), status: 'DEFAULTED' },
                }),
            ]),
        );
        await PayrollMonthlyService.unfinalize(db as any, 'ps1');
        expect(tx.employeeLoan.update.mock.calls[0][0].data).toEqual({
            remainingBalance: { increment: 200_000 },
        });
        for (const call of tx.employeeLoan.updateMany.mock.calls) {
            expect(call[0].where.status).toBe('PAID_OFF'); // DEFAULTED can never match
        }
    });

    it('partial installment: balance goes up by the payment amount', async () => {
        const { db, tx } = setup(
            finalized([
                payment({
                    id: 'lp2',
                    amount: dec(300_000),
                    loan: { id: 'loan2', loanNumber: 'KSB-2', remainingBalance: dec(700_000), status: 'ACTIVE' },
                }),
            ]),
        );
        await PayrollMonthlyService.unfinalize(db as any, 'ps1');
        expect(tx.employeeLoan.update.mock.calls[0][0].data).toEqual({
            remainingBalance: { increment: 300_000 },
        });
    });

    it('passes reversedPayments (loan, number, amount, date) to onCommit inside the tx', async () => {
        const { db, tx } = setup();
        const onCommit = vi.fn().mockResolvedValue(undefined);
        await PayrollMonthlyService.unfinalize(db as any, 'ps1', { onCommit });

        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit.mock.calls[0][0]).toBe(tx);
        expect(onCommit.mock.calls[0][1]).toMatchObject({
            employeeId: 'e1',
            reversedPayments: [
                {
                    loanId: 'loan1',
                    loanNumber: 'KSB-2026-0001',
                    amount: 500_000,
                    date: new Date('2026-07-31T00:00:00Z'),
                },
            ],
        });
    });

    it('onCommit failure rejects the whole unfinalize', async () => {
        const { db } = setup();
        await expect(
            PayrollMonthlyService.unfinalize(db as any, 'ps1', {
                onCommit: vi.fn().mockRejectedValue(new Error('audit gagal')),
            }),
        ).rejects.toThrow('audit gagal');
    });

    it.each([
        ['DRAFT', /sudah DRAFT/],
        ['PAID', /PAID/],
    ])('claim lost on %s payslip → matching error, no loan writes, no onCommit', async (status, re) => {
        const { db, tx } = setup();
        tx.payslip.updateMany.mockResolvedValue({ count: 0 });
        tx.payslip.findUnique.mockReset();
        tx.payslip.findUnique.mockResolvedValue({ id: 'ps1', status });
        const onCommit = vi.fn();
        await expect(
            PayrollMonthlyService.unfinalize(db as any, 'ps1', { onCommit }),
        ).rejects.toThrow(re);
        expect(tx.employeeLoan.update).not.toHaveBeenCalled();
        expect(tx.employeeLoanPayment.delete).not.toHaveBeenCalled();
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('claim lost on a missing payslip → NotFoundError', async () => {
        const { db, tx } = setup();
        tx.payslip.updateMany.mockResolvedValue({ count: 0 });
        tx.payslip.findUnique.mockReset();
        tx.payslip.findUnique.mockResolvedValue(null);
        await expect(PayrollMonthlyService.unfinalize(db as any, 'ps1')).rejects.toThrow(
            /tidak ditemukan/i,
        );
    });

    it('CLOSED period: throws and loan balances are untouched', async () => {
        const { db, tx } = setup(finalized([payment()], 'CLOSED'));
        const onCommit = vi.fn();
        await expect(
            PayrollMonthlyService.unfinalize(db as any, 'ps1', { onCommit }),
        ).rejects.toThrow(/CLOSED/);
        expect(tx.employeeLoan.update).not.toHaveBeenCalled();
        expect(onCommit).not.toHaveBeenCalled();
    });
});

// ─── markPaid ───────────────────────────────────────

describe('PayrollMonthlyService.markPaid', () => {
    function setup() {
        const ctx = makeTxDb();
        ctx.tx.payslip.updateMany.mockResolvedValue({ count: 1 });
        ctx.tx.payslip.findUnique.mockResolvedValue({ id: 'ps1', employeeId: 'e1', status: 'PAID' });
        return ctx;
    }

    it('claims FINALIZED→PAID atomically and returns the payslip', async () => {
        const { db, tx } = setup();
        const result = await PayrollMonthlyService.markPaid(db as any, 'ps1');
        expect(tx.payslip.updateMany.mock.calls[0][0]).toEqual({
            where: { id: 'ps1', status: 'FINALIZED' },
            data: { status: 'PAID' },
        });
        expect(result.status).toBe('PAID');
    });

    it('rejects when not FINALIZED (guard matches nothing)', async () => {
        const { db, tx } = setup();
        tx.payslip.updateMany.mockResolvedValue({ count: 0 });
        tx.payslip.findUnique.mockResolvedValue({ id: 'ps1', status: 'DRAFT' });
        await expect(PayrollMonthlyService.markPaid(db as any, 'ps1')).rejects.toThrow(
            /FINALIZED/,
        );
    });

    it('NotFoundError for a missing payslip', async () => {
        const { db, tx } = setup();
        tx.payslip.updateMany.mockResolvedValue({ count: 0 });
        tx.payslip.findUnique.mockResolvedValue(null);
        await expect(PayrollMonthlyService.markPaid(db as any, 'ps1')).rejects.toThrow(
            /tidak ditemukan/i,
        );
    });

    it('calls onCommit inside the tx; failure aborts', async () => {
        const { db, tx } = setup();
        const onCommit = vi.fn().mockResolvedValue(undefined);
        await PayrollMonthlyService.markPaid(db as any, 'ps1', { onCommit });
        expect(onCommit.mock.calls[0][0]).toBe(tx);
        expect(onCommit.mock.calls[0][1]).toMatchObject({ employeeId: 'e1' });
        await expect(
            PayrollMonthlyService.markPaid(db as any, 'ps1', {
                onCommit: vi.fn().mockRejectedValue(new Error('audit gagal')),
            }),
        ).rejects.toThrow('audit gagal');
    });
});

// ─── closePeriod ────────────────────────────────────

describe('PayrollMonthlyService.closePeriod', () => {
    function setup(unpaid = 0) {
        const ctx = makeTxDb();
        const tx = ctx.tx as any;
        tx.payslip.count = vi.fn().mockResolvedValue(unpaid);
        tx.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });
        tx.payrollPeriod.findUnique.mockResolvedValue({
            id: 'p1',
            year: 2026,
            month: 7,
            status: 'CLOSED',
        });
        return { db: ctx.db, tx };
    }

    it('claims OPEN→CLOSED atomically with closedBy and returns the period', async () => {
        const { db, tx } = setup();
        const result = await PayrollMonthlyService.closePeriod(db as any, 'p1', 'user-1');
        const arg = tx.payrollPeriod.updateMany.mock.calls[0][0];
        expect(arg.where).toEqual({ id: 'p1', status: 'OPEN' });
        expect(arg.data).toMatchObject({ status: 'CLOSED', closedById: 'user-1' });
        expect(arg.data.closedAt).toBeInstanceOf(Date);
        expect(result.year).toBe(2026);
    });

    it('rejects when unpaid payslips remain (tx aborted, so the claim is rolled back)', async () => {
        const { db, tx } = setup(2);
        await expect(
            PayrollMonthlyService.closePeriod(db as any, 'p1', 'user-1'),
        ).rejects.toThrow(/Masih ada 2 payslip belum PAID/);
        expect(tx.payslip.count.mock.calls[0][0].where).toMatchObject({
            payrollPeriodId: 'p1',
            status: { not: 'PAID' },
        });
    });

    it('rejects an already CLOSED period', async () => {
        const { db, tx } = setup();
        tx.payrollPeriod.updateMany.mockResolvedValue({ count: 0 });
        await expect(
            PayrollMonthlyService.closePeriod(db as any, 'p1', 'user-1'),
        ).rejects.toThrow(/sudah CLOSED/);
    });

    it('NotFoundError for a missing period', async () => {
        const { db, tx } = setup();
        tx.payrollPeriod.updateMany.mockResolvedValue({ count: 0 });
        tx.payrollPeriod.findUnique.mockResolvedValue(null);
        await expect(
            PayrollMonthlyService.closePeriod(db as any, 'p1', 'user-1'),
        ).rejects.toThrow(/tidak ditemukan/i);
    });

    it('calls onCommit inside the tx; failure aborts', async () => {
        const { db, tx } = setup();
        const onCommit = vi.fn().mockResolvedValue(undefined);
        await PayrollMonthlyService.closePeriod(db as any, 'p1', 'user-1', { onCommit });
        expect(onCommit.mock.calls[0][0]).toBe(tx);
        expect(onCommit.mock.calls[0][1]).toMatchObject({ year: 2026, month: 7 });
        await expect(
            PayrollMonthlyService.closePeriod(db as any, 'p1', 'user-1', {
                onCommit: vi.fn().mockRejectedValue(new Error('audit gagal')),
            }),
        ).rejects.toThrow('audit gagal');
    });
});

// ─── allowances (IDOR within tenant) ────────────────

describe('EmployeeAllowanceService', () => {
    function setup() {
        const tx = {
            employeeAllowance: {
                findMany: vi.fn(),
                updateMany: vi.fn(),
                create: vi.fn(),
            },
        };
        const db = {
            employee: { findUnique: vi.fn().mockResolvedValue({ id: 'e1' }) },
            employeeAllowance: { updateMany: vi.fn() },
            $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
        };
        tx.employeeAllowance.updateMany.mockResolvedValue({ count: 1 });
        tx.employeeAllowance.create.mockResolvedValue({ id: 'new-1', name: 'Baru', amount: 1 });
        tx.employeeAllowance.findMany.mockResolvedValue([]);
        return { tx, db };
    }

    it('updates an existing item scoped by { id, employeeId }', async () => {
        const { db, tx } = setup();
        await EmployeeAllowanceService.replaceForEmployee(db as any, 'e1', [
            { id: 'a1', name: 'Transport', amount: 100 },
        ]);
        const call = tx.employeeAllowance.updateMany.mock.calls.find(
            (c: any) => c[0].data.name === 'Transport',
        );
        expect(call?.[0].where).toEqual({ id: 'a1', employeeId: 'e1' });
    });

    it("rejects an id that belongs to another employee (count 0) and aborts", async () => {
        const { db, tx } = setup();
        tx.employeeAllowance.updateMany.mockResolvedValue({ count: 0 });
        await expect(
            EmployeeAllowanceService.replaceForEmployee(db as any, 'e1', [
                { id: 'foreign', name: 'X', amount: 1 },
            ]),
        ).rejects.toThrow(/tidak ditemukan/i);
        expect(tx.employeeAllowance.create).not.toHaveBeenCalled();
    });

    it('soft-deactivates removed rows scoped by employee', async () => {
        const { db, tx } = setup();
        tx.employeeAllowance.findMany.mockResolvedValueOnce([{ id: 'old', employeeId: 'e1' }]);
        await EmployeeAllowanceService.replaceForEmployee(db as any, 'e1', []);
        expect(tx.employeeAllowance.updateMany).toHaveBeenCalledWith({
            where: { id: 'old', employeeId: 'e1' },
            data: { isActive: false },
        });
    });

    it('remove soft-deletes scoped by { id, employeeId }', async () => {
        const { db } = setup();
        db.employeeAllowance.updateMany.mockResolvedValue({ count: 1 });
        await EmployeeAllowanceService.remove(db as any, 'a1', 'e1');
        expect(db.employeeAllowance.updateMany).toHaveBeenCalledWith({
            where: { id: 'a1', employeeId: 'e1' },
            data: { isActive: false },
        });
    });

    it('remove rejects an allowance of another employee', async () => {
        const { db } = setup();
        db.employeeAllowance.updateMany.mockResolvedValue({ count: 0 });
        await expect(
            EmployeeAllowanceService.remove(db as any, 'a1', 'other'),
        ).rejects.toThrow(/tidak ditemukan/i);
    });
});
