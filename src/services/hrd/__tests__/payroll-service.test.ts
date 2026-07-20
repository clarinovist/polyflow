import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calcPieceEarnings } from '../piece-rate-helpers';
import { PayrollService } from '../payroll-service';
import { isLastWeekOfMonth, monthEndContainedInWeek } from '../week-range';

function dec(n: number) {
  return { toNumber: () => n, valueOf: () => n } as any;
}

describe('calcPieceEarnings', () => {
  it('rounds qty × rate to 2 decimals', () => {
    expect(calcPieceEarnings(100, 150)).toBe(15000);
    expect(calcPieceEarnings(1.5, 100)).toBe(150);
  });

  it('returns 0 for non-positive inputs', () => {
    expect(calcPieceEarnings(0, 150)).toBe(0);
    expect(calcPieceEarnings(10, 0)).toBe(0);
  });
});

describe('isLastWeekOfMonth / monthEndContainedInWeek', () => {
  it('detects week containing month-end (Jul 27–Aug 2 contains Jul 31)', () => {
    const start = new Date('2026-07-27T00:00:00.000Z');
    const end = new Date('2026-08-02T23:59:59.999Z');
    expect(isLastWeekOfMonth(start, end)).toBe(true);
    expect(monthEndContainedInWeek(start, end)).toEqual({ year: 2026, month: 7 });
  });

  it('returns false for mid-month week', () => {
    const start = new Date('2026-07-13T00:00:00.000Z');
    const end = new Date('2026-07-19T23:59:59.999Z');
    expect(isLastWeekOfMonth(start, end)).toBe(false);
    expect(monthEndContainedInWeek(start, end)).toBeNull();
  });

  it('detects last full week of August 2026 (Aug 24–30 contains Aug 31? no; Aug 31–Sep 6 does)', () => {
    // Aug 31 2026 is Monday → week Aug 31 – Sep 6
    const start = new Date('2026-08-31T00:00:00.000Z');
    const end = new Date('2026-09-06T23:59:59.999Z');
    expect(isLastWeekOfMonth(start, end)).toBe(true);
    expect(monthEndContainedInWeek(start, end)).toEqual({ year: 2026, month: 8 });
  });
});

describe('PayrollService dual pay', () => {
  const mockDb = {
    employee: { findUnique: vi.fn(), findMany: vi.fn() },
    attendanceRecord: { findMany: vi.fn() },
    productionExecution: { findMany: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const weekStart = new Date('2026-07-13T00:00:00.000Z');
  const weekEnd = new Date('2026-07-19T23:59:59.999Z');

  it('DAILY: sums attendance earnings, ignores production', async () => {
    vi.mocked(mockDb.employee.findUnique).mockResolvedValue({
      id: 'emp-1', name: 'Budi', code: 'EMP-001', payType: 'DAILY',
      bpjsParticipant: false, bpjsEmployeeDeduction: null,
    } as any);
    vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([
      {
        workDate: new Date('2026-07-14T00:00:00.000Z'),
        status: 'PRESENT',
        actualHours: dec(8),
        overtimeHours: dec(0),
        dailyEarnings: dec(100000),
        overtimeEarnings: dec(0),
        totalEarnings: dec(100000),
        workShift: { name: 'Pagi-8' },
      },
    ] as any);

    const result = await PayrollService.getWeeklyPayroll(mockDb as any, 'emp-1', weekStart, weekEnd);

    expect(result.payType).toBe('DAILY');
    expect(result.totalEarnings).toBe(100000);
    expect(result.totalPieceEarnings).toBe(0);
    expect(result.bpjsDeduction).toBe(0);
    expect(result.isBpjsWeek).toBe(false);
    expect(result.netPay).toBe(100000);
    expect(mockDb.productionExecution.findMany).not.toHaveBeenCalled();
  });

  it('DAILY: deducts full monthly BPJS on last week of month only', async () => {
    // Week containing Jul 31 2026 (Fri) → Mon Jul 27 – Sun Aug 2
    const lastWeekStart = new Date('2026-07-27T00:00:00.000Z');
    const lastWeekEnd = new Date('2026-08-02T23:59:59.999Z');
    vi.mocked(mockDb.employee.findUnique).mockResolvedValue({
      id: 'emp-1', name: 'Budi', code: 'EMP-001', payType: 'DAILY',
      bpjsParticipant: true, bpjsEmployeeDeduction: dec(150_000),
    } as any);
    vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([
      {
        workDate: new Date('2026-07-28T00:00:00.000Z'),
        status: 'PRESENT',
        actualHours: dec(8),
        overtimeHours: dec(0),
        dailyEarnings: dec(500_000),
        overtimeEarnings: dec(0),
        totalEarnings: dec(500_000),
        workShift: { name: 'Pagi-8' },
      },
    ] as any);

    const result = await PayrollService.getWeeklyPayroll(
      mockDb as any, 'emp-1', lastWeekStart, lastWeekEnd,
    );

    expect(result.isBpjsWeek).toBe(true);
    expect(result.bpjsDeduction).toBe(150_000);
    expect(result.totalEarnings).toBe(500_000);
    expect(result.netPay).toBe(350_000);
  });

  it('DAILY: no BPJS mid-month even if participant', async () => {
    vi.mocked(mockDb.employee.findUnique).mockResolvedValue({
      id: 'emp-1', name: 'Budi', code: 'EMP-001', payType: 'DAILY',
      bpjsParticipant: true, bpjsEmployeeDeduction: dec(150_000),
    } as any);
    vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([] as any);

    const result = await PayrollService.getWeeklyPayroll(mockDb as any, 'emp-1', weekStart, weekEnd);

    expect(result.isBpjsWeek).toBe(false);
    expect(result.bpjsDeduction).toBe(0);
  });

  it('MONTHLY: never deducts BPJS on weekly payroll', async () => {
    const lastWeekStart = new Date('2026-07-27T00:00:00.000Z');
    const lastWeekEnd = new Date('2026-08-02T23:59:59.999Z');
    vi.mocked(mockDb.employee.findUnique).mockResolvedValue({
      id: 'emp-m', name: 'Sari', code: 'EMP-M', payType: 'MONTHLY',
      bpjsParticipant: true, bpjsEmployeeDeduction: dec(200_000),
    } as any);
    vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([] as any);

    const result = await PayrollService.getWeeklyPayroll(
      mockDb as any, 'emp-m', lastWeekStart, lastWeekEnd,
    );

    expect(result.isBpjsWeek).toBe(true);
    expect(result.bpjsDeduction).toBe(0);
  });

  it('PIECE: pays only when PRESENT same day + rate present', async () => {
    vi.mocked(mockDb.employee.findUnique).mockResolvedValue({
      id: 'emp-2', name: 'Ani', code: 'EMP-002', payType: 'PIECE',
      bpjsParticipant: false, bpjsEmployeeDeduction: null,
    } as any);
    // PRESENT on 14 Jul only
    vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([
      {
        workDate: new Date('2026-07-14T00:00:00.000Z'),
        status: 'PRESENT',
        actualHours: dec(8),
        overtimeHours: dec(0),
        dailyEarnings: dec(999), // must be forced to 0 for PIECE total
        overtimeEarnings: dec(0),
        totalEarnings: dec(999),
        workShift: { name: 'Pagi-8' },
      },
    ] as any);

    // 100kg with rate on 14 Jul (paid), 50kg on 15 Jul no attendance (unpaid)
    vi.mocked(mockDb.productionExecution.findMany).mockResolvedValue([
      {
        id: 'ex-1',
        startTime: new Date('2026-07-14T03:00:00.000Z'), // 10:00 WIB → 14 Jul
        quantityProduced: dec(100),
        pieceRateSnapshot: dec(150),
        pieceEarnings: dec(15000),
        pieceMachineType: 'EXTRUDER',
      },
      {
        id: 'ex-2',
        startTime: new Date('2026-07-15T03:00:00.000Z'), // 15 Jul no attendance
        quantityProduced: dec(50),
        pieceRateSnapshot: dec(150),
        pieceEarnings: dec(7500),
        pieceMachineType: 'EXTRUDER',
      },
      {
        id: 'ex-3',
        startTime: new Date('2026-07-14T05:00:00.000Z'), // same day, rate missing
        quantityProduced: dec(20),
        pieceRateSnapshot: null,
        pieceEarnings: null,
        pieceMachineType: 'EXTRUDER',
      },
    ] as any);

    const result = await PayrollService.getWeeklyPayroll(mockDb as any, 'emp-2', weekStart, weekEnd);

    expect(result.payType).toBe('PIECE');
    expect(result.totalPieceEarnings).toBe(15000);
    expect(result.totalKgPaid).toBe(100);
    expect(result.totalKgUnpaid).toBe(70); // 50 + 20
    expect(result.totalDailyEarnings).toBe(0);
    expect(result.totalEarnings).toBe(15000);
    expect(result.exceptions).toHaveLength(2);
    expect(result.exceptions.map((e) => e.reason).sort()).toEqual(['NO_ATTENDANCE', 'RATE_MISSING']);
  });
});
