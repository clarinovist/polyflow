import { describe, expect, it } from 'vitest';
import { daysBetween, getMonthName, mapHrdShiftBoard } from '../dashboard-kpis';

describe('getMonthName', () => {
  it('returns Indonesian month names', () => {
    expect(getMonthName(1)).toBe('Januari');
    expect(getMonthName(7)).toBe('Juli');
    expect(getMonthName(12)).toBe('Desember');
  });
});

describe('daysBetween', () => {
  it('counts whole days from created to today', () => {
    const created = new Date('2026-07-15T00:00:00.000Z');
    const today = new Date('2026-07-22T00:00:00.000Z');
    expect(daysBetween(created, today)).toBe(7);
  });
});

describe('mapHrdShiftBoard', () => {
  it('maps counts + attention lists and flags periods needing generate', () => {
    const board = mapHrdShiftBoard({
      today: '2026-07-22',
      presentToday: 12,
      leavePendingCount: 3,
      loanOutstanding: 1_500_000,
      loanActiveCount: 2,
      openPeriodsCount: 2,
      bpjsCount: 40,
      hrAlertsUnreadCount: 1,
      absentYesterdayCount: 4,
      pendingLeaves: [
        {
          id: 'lv-1',
          type: 'ANNUAL',
          startDate: new Date('2026-07-25T00:00:00.000Z'),
          createdAt: new Date('2026-07-20T00:00:00.000Z'),
          employee: { name: 'Budi' },
        },
      ],
      hrAlerts: [
        {
          id: 'n-1',
          title: 'Kontrak Siti berakhir',
          type: 'HRD_CONTRACT_EXPIRING',
          createdAt: new Date('2026-07-21T00:00:00.000Z'),
        },
      ],
      openPeriods: [
        { id: 'p-1', year: 2026, month: 7, status: 'OPEN', payslipCount: 0 },
        { id: 'p-2', year: 2026, month: 6, status: 'OPEN', payslipCount: 10 },
      ],
      absentYesterday: [
        {
          employeeId: 'e-1',
          employee: { name: 'Andi', code: 'EMP-001' },
        },
      ],
    });

    expect(board.counts.presentToday).toBe(12);
    expect(board.counts.leavePending).toBe(3);
    expect(board.counts.loanOutstanding).toBe(1_500_000);
    expect(board.counts.openPayrollPeriods).toBe(2);
    expect(board.counts.periodsNeedGenerate).toBe(1);
    expect(board.counts.absentYesterday).toBe(4);
    expect(board.counts.hrAlertsUnread).toBe(1);

    expect(board.attention.pendingLeaves).toHaveLength(1);
    expect(board.attention.pendingLeaves[0]).toMatchObject({
      id: 'lv-1',
      employeeName: 'Budi',
      type: 'ANNUAL',
      daysPending: 2,
    });

    expect(board.attention.hrAlerts[0]).toMatchObject({
      id: 'n-1',
      title: 'Kontrak Siti berakhir',
      type: 'HRD_CONTRACT_EXPIRING',
    });

    expect(board.attention.openPeriods).toEqual([
      { id: 'p-1', label: 'Juli 2026', status: 'OPEN', needsGenerate: true },
      { id: 'p-2', label: 'Juni 2026', status: 'OPEN', needsGenerate: false },
    ]);

    expect(board.attention.absentYesterday).toEqual([
      { employeeId: 'e-1', employeeName: 'Andi', employeeCode: 'EMP-001' },
    ]);

    expect(board.today).toBe('2026-07-22');
  });

  it('returns zero periodsNeedGenerate when all open periods have payslips', () => {
    const board = mapHrdShiftBoard({
      today: '2026-07-22',
      presentToday: 0,
      leavePendingCount: 0,
      loanOutstanding: 0,
      loanActiveCount: 0,
      openPeriodsCount: 1,
      bpjsCount: 0,
      hrAlertsUnreadCount: 0,
      absentYesterdayCount: 0,
      pendingLeaves: [],
      hrAlerts: [],
      openPeriods: [
        { id: 'p-1', year: 2026, month: 7, status: 'OPEN', payslipCount: 5 },
      ],
      absentYesterday: [],
    });

    expect(board.counts.periodsNeedGenerate).toBe(0);
    expect(board.attention.openPeriods[0]?.needsGenerate).toBe(false);
  });
});
