import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BpjsRecapService } from '@/services/hrd/bpjs-recap-service';

function dec(n: number) {
  return { toNumber: () => n, valueOf: () => n, [Symbol.toPrimitive]: () => n };
}

describe('BpjsRecapService.getRecap', () => {
  const mockDb = {
    employee: { findMany: vi.fn() },
    payrollPeriod: { findFirst: vi.fn() },
    payslip: { findMany: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shopfloor participant uses master deduction as actual (WEEKLY_LAST)', async () => {
    mockDb.employee.findMany.mockResolvedValue([
      {
        id: 'e1',
        code: 'EMP-1',
        name: 'Ali',
        payType: 'DAILY',
        status: 'ACTIVE',
        bpjsEmployeeDeduction: dec(150_000),
        bpjsEmployerCost: dec(200_000),
        bpjsKesehatanNo: 'K1',
        bpjsKetenagakerjaanNo: 'T1',
      },
    ]);
    mockDb.payrollPeriod.findFirst.mockResolvedValue(null);

    const res = await BpjsRecapService.getRecap(mockDb as never, 2026, 7);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].actualDeducted).toBe(150_000);
    expect(res.rows[0].source).toBe('WEEKLY_LAST');
    expect(res.rows[0].employerCostMaster).toBe(200_000);
    expect(res.totals.participants).toBe(1);
    expect(res.totals.sumActualDeducted).toBe(150_000);
  });

  it('MONTHLY uses payslip bpjs when period exists', async () => {
    mockDb.employee.findMany.mockResolvedValue([
      {
        id: 'e2',
        code: 'EMP-2',
        name: 'Budi',
        payType: 'MONTHLY',
        status: 'ACTIVE',
        bpjsEmployeeDeduction: dec(100_000),
        bpjsEmployerCost: dec(120_000),
        bpjsKesehatanNo: null,
        bpjsKetenagakerjaanNo: null,
      },
    ]);
    mockDb.payrollPeriod.findFirst.mockResolvedValue({ id: 'p1' });
    mockDb.payslip.findMany.mockResolvedValue([
      { employeeId: 'e2', bpjsDeduction: dec(99_000) },
    ]);

    const res = await BpjsRecapService.getRecap(mockDb as never, 2026, 7);
    expect(res.rows[0].actualDeducted).toBe(99_000);
    expect(res.rows[0].source).toBe('MONTHLY_SLIP');
  });

  it('MONTHLY without payslip marks belum potong (NONE)', async () => {
    mockDb.employee.findMany.mockResolvedValue([
      {
        id: 'e3',
        code: 'EMP-3',
        name: 'Citra',
        payType: 'MONTHLY',
        status: 'ACTIVE',
        bpjsEmployeeDeduction: dec(100_000),
        bpjsEmployerCost: dec(0),
        bpjsKesehatanNo: null,
        bpjsKetenagakerjaanNo: null,
      },
    ]);
    mockDb.payrollPeriod.findFirst.mockResolvedValue(null);

    const res = await BpjsRecapService.getRecap(mockDb as never, 2026, 7);
    expect(res.rows[0].actualDeducted).toBe(0);
    expect(res.rows[0].source).toBe('NONE');
  });
});
