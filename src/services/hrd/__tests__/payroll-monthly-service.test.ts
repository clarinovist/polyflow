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
// Every write must go through the transaction client: `db` only exposes $transaction.
function makeLoanPaymentDb() {
  const tx = {
    employeeLoan: { updateMany: vi.fn(), findUnique: vi.fn() },
    employeeLoanPayment: { create: vi.fn() },
  };
  const db = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  return { tx, db };
}

describe("EmployeeLoanService.recordPayment", () => {
  const paymentInput = (amount: number) => ({
    amount,
    date: new Date("2026-08-08T00:00:00Z"),
    notes: "tunai",
  });

  const loanRow = (over: Record<string, unknown> = {}) => ({
    id: "l1",
    loanNumber: "KSB-2026-0001",
    status: "ACTIVE",
    remainingBalance: dec(1_500_000),
    employee: { id: "e1", name: "Budi", code: "EMP-1" },
    ...over,
  });

  function setup() {
    const ctx = makeLoanPaymentDb();
    ctx.tx.employeeLoan.updateMany.mockResolvedValue({ count: 1 });
    ctx.tx.employeeLoanPayment.create.mockResolvedValue({
      id: "p1",
      amount: 400_000,
    });
    ctx.tx.employeeLoan.findUnique.mockResolvedValue(loanRow());
    return ctx;
  }

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects amount %s without opening a transaction",
    async (amount) => {
      const { db } = setup();
      await expect(
        EmployeeLoanService.recordPayment(
          db as any,
          "l1",
          paymentInput(amount),
        ),
      ).rejects.toThrow(/harus > 0/i);
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  it("rejects when loan not found and writes nothing", async () => {
    const { db, tx } = setup();
    tx.employeeLoan.updateMany.mockResolvedValue({ count: 0 });
    tx.employeeLoan.findUnique.mockResolvedValue(null);
    await expect(
      EmployeeLoanService.recordPayment(db as any, "l1", paymentInput(100_000)),
    ).rejects.toThrow(/tidak ditemukan/i);
    expect(tx.employeeLoanPayment.create).not.toHaveBeenCalled();
  });

  it("rejects payment on PAID_OFF loan with LUNAS message and writes nothing", async () => {
    const { db, tx } = setup();
    tx.employeeLoan.updateMany.mockResolvedValue({ count: 0 });
    tx.employeeLoan.findUnique.mockResolvedValue(
      loanRow({ status: "PAID_OFF", remainingBalance: dec(0) }),
    );
    await expect(
      EmployeeLoanService.recordPayment(db as any, "l1", paymentInput(100_000)),
    ).rejects.toThrow(/sudah LUNAS/i);
    expect(tx.employeeLoanPayment.create).not.toHaveBeenCalled();
    expect(tx.employeeLoan.updateMany).toHaveBeenCalledTimes(1);
  });

  it("rejects payment on DEFAULTED loan and writes nothing", async () => {
    const { db, tx } = setup();
    tx.employeeLoan.updateMany.mockResolvedValue({ count: 0 });
    tx.employeeLoan.findUnique.mockResolvedValue(
      loanRow({ status: "DEFAULTED" }),
    );
    await expect(
      EmployeeLoanService.recordPayment(db as any, "l1", paymentInput(100_000)),
    ).rejects.toThrow(/DEFAULTED/i);
    expect(tx.employeeLoanPayment.create).not.toHaveBeenCalled();
  });

  it("rejects overpayment beyond remaining balance and writes nothing", async () => {
    const { db, tx } = setup();
    tx.employeeLoan.updateMany.mockResolvedValue({ count: 0 });
    tx.employeeLoan.findUnique.mockResolvedValue(loanRow());
    await expect(
      EmployeeLoanService.recordPayment(
        db as any,
        "l1",
        paymentInput(1_500_001),
      ),
    ).rejects.toThrow(/melebihi sisa/i);
    expect(tx.employeeLoanPayment.create).not.toHaveBeenCalled();
  });

  it("claims with gte guard + atomic decrement (no absolute balance written)", async () => {
    const { db, tx } = setup();
    await EmployeeLoanService.recordPayment(
      db as any,
      "l1",
      paymentInput(400_000),
    );

    expect(tx.employeeLoan.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "l1", status: "ACTIVE", remainingBalance: { gte: 400_000 } },
      data: { remainingBalance: { decrement: 400_000 } },
    });
    const payArg = tx.employeeLoanPayment.create.mock.calls[0][0];
    expect(payArg.data.amount).toBe(400_000);
    expect(payArg.data.payslipId).toBeNull();
  });

  it("marks PAID_OFF atomically only when balance reached zero", async () => {
    const { db, tx } = setup();
    await EmployeeLoanService.recordPayment(
      db as any,
      "l1",
      paymentInput(1_500_000),
    );

    expect(tx.employeeLoan.updateMany.mock.calls[1][0]).toEqual({
      where: { id: "l1", status: "ACTIVE", remainingBalance: { lte: 0 } },
      data: { status: "PAID_OFF" },
    });
  });

  it("returns payment and loan with employee", async () => {
    const { db } = setup();
    const result = await EmployeeLoanService.recordPayment(
      db as any,
      "l1",
      paymentInput(400_000),
    );
    expect(result.payment.id).toBe("p1");
    expect(result.loan.employee.code).toBe("EMP-1");
  });

  it("rounds the amount to 2 decimals", async () => {
    const { db, tx } = setup();
    await EmployeeLoanService.recordPayment(
      db as any,
      "l1",
      paymentInput(100.004),
    );
    expect(
      tx.employeeLoan.updateMany.mock.calls[0][0].data.remainingBalance,
    ).toEqual({
      decrement: 100,
    });
  });

  it("calls onCommit inside the transaction with loan facts; rejection aborts", async () => {
    const { db, tx } = setup();
    const onCommit = vi.fn().mockResolvedValue(undefined);
    await EmployeeLoanService.recordPayment(
      db as any,
      "l1",
      paymentInput(400_000),
      {
        onCommit,
      },
    );
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0]).toBe(tx);
    expect(onCommit.mock.calls[0][1]).toMatchObject({
      paymentAmount: 400_000,
      loanNumber: "KSB-2026-0001",
      employeeCode: "EMP-1",
    });

    const failing = vi.fn().mockRejectedValue(new Error("audit gagal"));
    await expect(
      EmployeeLoanService.recordPayment(
        db as any,
        "l1",
        paymentInput(400_000),
        {
          onCommit: failing,
        },
      ),
    ).rejects.toThrow("audit gagal");
  });
});

// ─── generateDrafts ─────────────────────────────────

function makeGenerateDb() {
  const tx = {
    payrollPeriod: { upsert: vi.fn() },
    employee: { findMany: vi.fn() },
    payslip: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    attendanceRecord: { groupBy: vi.fn(), count: vi.fn() },
  };
  const db = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  tx.payrollPeriod.upsert.mockResolvedValue({
    id: "period-1",
    year: 2026,
    month: 7,
    status: "OPEN",
  });
  tx.payslip.findMany.mockResolvedValue([]);
  tx.attendanceRecord.groupBy.mockResolvedValue([]);
  tx.payslip.create.mockResolvedValue({ id: "ps" });
  return { tx, db };
}

const emp = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  monthlySalary: dec(5_000_000),
  bpjsParticipant: false,
  bpjsEmployeeDeduction: null,
  allowances: [],
  loans: [],
  ...over,
});

describe("PayrollMonthlyService.generateDrafts", () => {
  it("computes gross without subtracting prorata; bpjs only if participant", async () => {
    const { db, tx } = makeGenerateDb();
    tx.employee.findMany.mockResolvedValue([
      emp("e1", {
        monthlySalary: dec(5_200_000),
        bpjsParticipant: true,
        bpjsEmployeeDeduction: dec(100_000),
        allowances: [{ name: "Transport", amount: dec(200_000) }],
      }),
    ]);
    // 1 absent day; July 2026 has 27 Mon-Sat → daily ≈ 192592.59
    tx.attendanceRecord.groupBy.mockResolvedValue([
      { employeeId: "e1", _count: { _all: 1 } },
    ]);

    const result = await PayrollMonthlyService.generateDrafts(db as any, {
      year: 2026,
      month: 7,
    });

    expect(result.created).toBe(1);
    const data = tx.payslip.create.mock.calls[0][0].data;
    expect(data.grossPay).toBe(5_400_000);
    expect(data.bpjsDeduction).toBe(100_000);
    expect(data.prorationDeduction).toBe(192_592.59);
    expect(data.netPay).toBe(
      Math.round((data.grossPay - data.deductionTotal) * 100) / 100,
    );
  });

  it("skips bpjs when not participant", async () => {
    const { db, tx } = makeGenerateDb();
    tx.employee.findMany.mockResolvedValue([
      emp("e2", {
        monthlySalary: dec(4_000_000),
        bpjsEmployeeDeduction: dec(100_000),
      }),
    ]);

    await PayrollMonthlyService.generateDrafts(db as any, {
      year: 2026,
      month: 7,
    });
    const data = tx.payslip.create.mock.calls[0][0].data;
    expect(data.bpjsDeduction).toBe(0);
    expect(data.grossPay).toBe(4_000_000);
    expect(data.netPay).toBe(4_000_000);
  });

  it("defers FULL_NEXT_MONTH loan to following month", async () => {
    const { db, tx } = makeGenerateDb();
    tx.employee.findMany.mockResolvedValue([
      emp("e3", {
        loans: [
          {
            repaymentType: "FULL_NEXT_MONTH",
            installmentAmount: null,
            remainingBalance: dec(1_000_000),
            date: new Date(Date.UTC(2026, 6, 10)),
          },
        ],
      }),
    ]);

    await PayrollMonthlyService.generateDrafts(db as any, {
      year: 2026,
      month: 7,
    });
    expect(tx.payslip.create.mock.calls[0][0].data.loanDeduction).toBe(0);

    tx.payslip.create.mockClear();
    await PayrollMonthlyService.generateDrafts(db as any, {
      year: 2026,
      month: 8,
    });
    expect(tx.payslip.create.mock.calls[0][0].data.loanDeduction).toBe(
      1_000_000,
    );
  });

  it("uses one groupBy for ABSENT counts and no per-employee queries", async () => {
    const { db, tx } = makeGenerateDb();
    tx.employee.findMany.mockResolvedValue([emp("e1"), emp("e2"), emp("e3")]);
    tx.attendanceRecord.groupBy.mockResolvedValue([
      { employeeId: "e2", _count: { _all: 2 } },
    ]);

    const result = await PayrollMonthlyService.generateDrafts(db as any, {
      year: 2026,
      month: 7,
    });

    expect(result.created).toBe(3);
    expect(tx.attendanceRecord.groupBy).toHaveBeenCalledTimes(1);
    const arg = tx.attendanceRecord.groupBy.mock.calls[0][0];
    expect(arg.by).toEqual(["employeeId"]);
    expect(arg.where.status).toBe("ABSENT");
    expect(arg.where.workDate).toEqual({
      gte: new Date(Date.UTC(2026, 6, 1)),
      lte: new Date(Date.UTC(2026, 6, 31)),
    });
    expect(tx.attendanceRecord.count).not.toHaveBeenCalled();
    expect(tx.payslip.findUnique).not.toHaveBeenCalled();
    expect(tx.payslip.findMany).toHaveBeenCalledTimes(1);

    const prorations = tx.payslip.create.mock.calls.map(
      (c: any) => c[0].data.prorationDeduction,
    );
    expect(prorations).toEqual([0, 370_370.37, 0]); // 2 × 5_000_000/27
  });

  it("skips employees that already have a payslip or no salary", async () => {
    const { db, tx } = makeGenerateDb();
    tx.employee.findMany.mockResolvedValue([
      emp("has-slip"),
      emp("no-salary", { monthlySalary: dec(0) }),
      emp("new"),
    ]);
    tx.payslip.findMany.mockResolvedValue([{ employeeId: "has-slip" }]);

    const result = await PayrollMonthlyService.generateDrafts(db as any, {
      year: 2026,
      month: 7,
    });

    expect(result).toEqual({ created: 1, skipped: 2, periodId: "period-1" });
    expect(tx.payslip.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a CLOSED period", async () => {
    const { db, tx } = makeGenerateDb();
    tx.payrollPeriod.upsert.mockResolvedValue({
      id: "period-1",
      year: 2026,
      month: 7,
      status: "CLOSED",
    });
    await expect(
      PayrollMonthlyService.generateDrafts(db as any, { year: 2026, month: 7 }),
    ).rejects.toThrow(/CLOSED/);
    expect(tx.payslip.create).not.toHaveBeenCalled();
  });

  it("maps a unique violation (double click) to a clear BusinessRuleError", async () => {
    const { db, tx } = makeGenerateDb();
    tx.employee.findMany.mockResolvedValue([emp("e1")]);
    tx.payslip.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );
    await expect(
      PayrollMonthlyService.generateDrafts(db as any, { year: 2026, month: 7 }),
    ).rejects.toThrow(/Draft sedang dibuat, muat ulang halaman/);
  });

  it("does not mask unrelated errors as unique violations", async () => {
    const { db, tx } = makeGenerateDb();
    tx.employee.findMany.mockResolvedValue([emp("e1")]);
    tx.payslip.create.mockRejectedValue(new Error("connection lost"));
    await expect(
      PayrollMonthlyService.generateDrafts(db as any, { year: 2026, month: 7 }),
    ).rejects.toThrow("connection lost");
  });

  it("runs everything in one transaction with a widened timeout and calls onCommit inside it", async () => {
    const { db, tx } = makeGenerateDb();
    tx.employee.findMany.mockResolvedValue([emp("e1")]);
    const onCommit = vi.fn().mockResolvedValue(undefined);

    await PayrollMonthlyService.generateDrafts(
      db as any,
      { year: 2026, month: 7 },
      { onCommit },
    );

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect((db.$transaction.mock.calls[0] as unknown[])[1]).toMatchObject({
      timeout: expect.any(Number),
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0]).toBe(tx);
    expect(onCommit.mock.calls[0][1]).toMatchObject({
      periodId: "period-1",
      created: 1,
      skipped: 0,
    });
    expect(tx.payslip.create.mock.invocationCallOrder[0]).toBeLessThan(
      onCommit.mock.invocationCallOrder[0],
    );
  });

  it("onCommit failure rejects the whole generation", async () => {
    const { db, tx } = makeGenerateDb();
    tx.employee.findMany.mockResolvedValue([emp("e1")]);
    await expect(
      PayrollMonthlyService.generateDrafts(
        db as any,
        { year: 2026, month: 7 },
        { onCommit: vi.fn().mockRejectedValue(new Error("audit gagal")) },
      ),
    ).rejects.toThrow("audit gagal");
  });
});

// ─── updateDraft ────────────────────────────────────

describe("PayrollMonthlyService.updateDraft", () => {
  const draft = (over: Record<string, unknown> = {}) => ({
    id: "ps1",
    employeeId: "e1",
    status: "DRAFT",
    payrollPeriod: { year: 2026, month: 7 },
    baseSalary: dec(5_000_000),
    allowanceTotal: dec(0),
    thrAmount: dec(0),
    prorationDeduction: dec(0),
    bpjsDeduction: dec(100_000),
    loanDeduction: dec(0),
    otherDeductions: dec(0),
    ...over,
  });

  function setup(payslip = draft()) {
    const db: any = {
      payslip: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(payslip)
          .mockImplementation(() =>
            Promise.resolve({ id: "ps1", employee: {} }),
          ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      employeeLoan: {
        findMany: vi.fn().mockResolvedValue([
          {
            repaymentType: "INSTALLMENT",
            installmentAmount: dec(200_000),
            remainingBalance: dec(1_000_000),
            date: new Date(Date.UTC(2026, 5, 1)),
          },
        ]),
      },
    };
    return db;
  }

  it("recomputes net with thr and other deductions via guarded updateMany", async () => {
    const db = setup();
    await PayrollMonthlyService.updateDraft(db, "ps1", {
      thrAmount: 1_000_000,
      otherDeductions: 50_000,
    });
    const arg = db.payslip.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "ps1", status: "DRAFT" });
    expect(arg.data.grossPay).toBe(6_000_000);
    expect(arg.data.deductionTotal).toBe(150_000);
    expect(arg.data.netPay).toBe(5_850_000);
  });

  it("rejects non-draft", async () => {
    const db = setup(draft({ status: "FINALIZED" }));
    await expect(
      PayrollMonthlyService.updateDraft(db, "ps1", { thrAmount: 1 }),
    ).rejects.toThrow(/DRAFT/i);
  });

  it("rejects when the payslip is finalized concurrently (guarded write matches nothing)", async () => {
    const db = setup();
    db.payslip.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      PayrollMonthlyService.updateDraft(db, "ps1", { thrAmount: 1 }),
    ).rejects.toThrow(/DRAFT/i);
  });

  it.each([
    ["thrAmount", "THR"],
    ["prorationDeduction", "prorata"],
    ["bpjsDeduction", "BPJS"],
    ["loanDeduction", "kasbon"],
    ["otherDeductions", "lainnya"],
  ])("rejects negative, NaN and Infinity for %s", async (field, label) => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const db = setup();
      await expect(
        PayrollMonthlyService.updateDraft(db, "ps1", { [field]: bad }),
      ).rejects.toThrow(new RegExp(label, "i"));
      expect(db.payslip.updateMany).not.toHaveBeenCalled();
    }
  });

  it("rejects loanDeduction above what the active loans entitle for this period", async () => {
    const db = setup();
    await expect(
      PayrollMonthlyService.updateDraft(db, "ps1", { loanDeduction: 200_001 }),
    ).rejects.toThrow(/melebihi/i);
    expect(db.payslip.updateMany).not.toHaveBeenCalled();
  });

  it("accepts loanDeduction up to the entitled amount", async () => {
    const db = setup();
    await PayrollMonthlyService.updateDraft(db, "ps1", {
      loanDeduction: 200_000,
    });
    expect(db.payslip.updateMany.mock.calls[0][0].data.loanDeduction).toBe(
      200_000,
    );
  });

  it("rejects any loanDeduction when the loan is not yet deductible in the period", async () => {
    const db = setup();
    db.employeeLoan.findMany.mockResolvedValue([
      {
        repaymentType: "FULL_NEXT_MONTH",
        installmentAmount: null,
        remainingBalance: dec(900_000),
        date: new Date(Date.UTC(2026, 6, 10)), // same month as period
      },
    ]);
    await expect(
      PayrollMonthlyService.updateDraft(db, "ps1", { loanDeduction: 1 }),
    ).rejects.toThrow(/melebihi/i);
  });

  it("does not query loans when loanDeduction is not part of the patch", async () => {
    const db = setup();
    await PayrollMonthlyService.updateDraft(db, "ps1", { thrAmount: 10 });
    expect(db.employeeLoan.findMany).not.toHaveBeenCalled();
  });
});
