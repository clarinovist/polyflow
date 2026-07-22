/** Pure date/month helpers — separated from 'use server' file. */

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const;

export function getMonthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

export function daysBetween(d1: Date, d2: Date): number {
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

/** Pure mapper — unit-tested without DB. */
export function mapHrdShiftBoard(input: {
  today: string;
  presentToday: number;
  leavePendingCount: number;
  loanOutstanding: number;
  loanActiveCount: number;
  openPeriodsCount: number;
  bpjsCount: number;
  hrAlertsUnreadCount: number;
  absentYesterdayCount: number;
  pendingLeaves: Array<{
    id: string;
    type: string;
    startDate: Date;
    createdAt: Date;
    employee: { name: string };
  }>;
  hrAlerts: Array<{
    id: string;
    title: string;
    type: string;
    createdAt: Date;
  }>;
  openPeriods: Array<{
    id: string;
    month: number;
    year: number;
    status: string;
    payslipCount: number;
  }>;
  absentYesterday: Array<{
    employeeId: string;
    employee: { name: string; code: string };
  }>;
}) {
  const todayDate = new Date(input.today);
  const periodsNeedGenerate = input.openPeriods.filter((p) => p.payslipCount === 0);

  return {
    counts: {
      presentToday: input.presentToday,
      leavePending: input.leavePendingCount,
      loanOutstanding: input.loanOutstanding,
      loanActiveCount: input.loanActiveCount,
      openPayrollPeriods: input.openPeriodsCount,
      bpjsParticipants: input.bpjsCount,
      hrAlertsUnread: input.hrAlertsUnreadCount,
      absentYesterday: input.absentYesterdayCount,
      periodsNeedGenerate: periodsNeedGenerate.length,
    },
    attention: {
      pendingLeaves: input.pendingLeaves.map((l) => ({
        id: l.id,
        employeeName: l.employee.name,
        type: l.type,
        startDate: l.startDate.toISOString(),
        daysPending: daysBetween(l.createdAt, todayDate),
      })),
      hrAlerts: input.hrAlerts.map((a) => ({
        id: a.id,
        title: a.title,
        type: a.type,
        createdAt: a.createdAt.toISOString(),
      })),
      openPeriods: input.openPeriods.map((p) => ({
        id: p.id,
        label: `${getMonthName(p.month)} ${p.year}`,
        status: p.status,
        needsGenerate: p.payslipCount === 0,
      })),
      absentYesterday: input.absentYesterday.map((r) => ({
        employeeId: r.employeeId,
        employeeName: r.employee.name,
        employeeCode: r.employee.code,
      })),
    },
    today: input.today,
  };
}
