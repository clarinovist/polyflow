import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '@/lib/errors/errors';

export interface PayrollRecord {
  date: Date;
  shiftName: string;
  status: string;
  actualHours: number | null;
  overtimeHours: number;
  dailyEarnings: number;
  overtimeEarnings: number;
  totalEarnings: number;
}

export interface WeeklyPayroll {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  weekStart: Date;
  weekEnd: Date;
  daysWorked: number;
  daysAbsent: number;
  totalActualHours: number;
  totalOvertimeHours: number;
  totalDailyEarnings: number;
  totalOvertimeEarnings: number;
  totalEarnings: number;
  records: PayrollRecord[];
}

function toNum(v: { toNumber?: () => number } | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return v.toNumber ? v.toNumber() : 0;
}

export const PayrollService = {
  async getWeeklyPayroll(
    db: PrismaClient,
    employeeId: string,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<WeeklyPayroll> {
    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, code: true },
    });
    if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');

    const records = await db.attendanceRecord.findMany({
      where: {
        employeeId,
        workDate: { gte: weekStart, lte: weekEnd },
      },
      include: {
        workShift: { select: { name: true } },
      },
      orderBy: { workDate: 'asc' },
    });

    let daysWorked = 0;
    let daysAbsent = 0;
    let totalActualHours = 0;
    let totalOvertimeHours = 0;
    let totalDailyEarnings = 0;
    let totalOvertimeEarnings = 0;

    const payrollRecords: PayrollRecord[] = records.map((r) => {
      const actualHours = r.actualHours == null ? null : toNum(r.actualHours);
      const overtimeHours = toNum(r.overtimeHours);
      const dailyEarnings = toNum(r.dailyEarnings);
      const overtimeEarnings = toNum(r.overtimeEarnings);
      const totalEarnings = toNum(r.totalEarnings);

      if (r.status === 'PRESENT') daysWorked += 1;
      if (r.status === 'ABSENT') daysAbsent += 1;
      if (actualHours != null) totalActualHours += actualHours;
      totalOvertimeHours += overtimeHours;
      totalDailyEarnings += dailyEarnings;
      totalOvertimeEarnings += overtimeEarnings;

      return {
        date: r.workDate,
        shiftName: r.workShift.name,
        status: r.status,
        actualHours,
        overtimeHours,
        dailyEarnings,
        overtimeEarnings,
        totalEarnings,
      };
    });

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      employeeCode: employee.code,
      weekStart,
      weekEnd,
      daysWorked,
      daysAbsent,
      totalActualHours: Math.round(totalActualHours * 100) / 100,
      totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
      totalDailyEarnings: Math.round(totalDailyEarnings * 100) / 100,
      totalOvertimeEarnings: Math.round(totalOvertimeEarnings * 100) / 100,
      totalEarnings: Math.round((totalDailyEarnings + totalOvertimeEarnings) * 100) / 100,
      records: payrollRecords,
    };
  },

  /** Get payroll for all active employees in a week. */
  async getWeeklyPayrollForAll(
    db: PrismaClient,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<WeeklyPayroll[]> {
    const employees = await db.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, code: true },
      orderBy: { code: 'asc' },
    });

    const results = await Promise.all(
      employees.map((e) => this.getWeeklyPayroll(db, e.id, weekStart, weekEnd)),
    );

    return results;
  },
};
