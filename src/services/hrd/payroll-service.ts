import { EmployeePayType, PrismaClient } from '@prisma/client';
import { NotFoundError } from '@/lib/errors/errors';
import { wibDateStringFrom } from '@/services/hrd/shift-window';
import { isLastWeekOfMonth, weekQueryRange } from '@/services/hrd/week-range';

export type PayrollExceptionReason = 'NO_ATTENDANCE' | 'RATE_MISSING';

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

export interface PiecePayrollLine {
  executionId: string;
  date: Date;
  machineType: string | null;
  quantityKg: number;
  ratePerKg: number | null;
  pieceEarnings: number | null;
  paid: boolean;
  reason?: PayrollExceptionReason;
}

export interface WeeklyPayroll {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  payType: EmployeePayType;
  weekStart: Date;
  weekEnd: Date;
  daysWorked: number;
  daysAbsent: number;
  totalActualHours: number;
  totalOvertimeHours: number;
  totalDailyEarnings: number;
  totalOvertimeEarnings: number;
  totalPieceEarnings: number;
  totalKgPaid: number;
  totalKgUnpaid: number;
  /** Gross from work (daily+OT or piece) before BPJS. */
  totalEarnings: number;
  /**
   * Full monthly BPJS employee deduction, applied only on the last week of the month
   * for DAILY/PIECE participants. 0 otherwise (including MONTHLY — handled by payslip bulanan).
   */
  bpjsDeduction: number;
  /** true when this week is the last week of a calendar month (contains month-end day). */
  isBpjsWeek: boolean;
  /** totalEarnings − bpjsDeduction */
  netPay: number;
  records: PayrollRecord[];
  pieceLines: PiecePayrollLine[];
  exceptions: PiecePayrollLine[];
}

function toNum(v: { toNumber?: () => number } | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return v.toNumber ? v.toNumber() : 0;
}

function dateKeyFromWorkDate(d: Date): string {
  // Attendance workDate is stored as date-only UTC midnight
  return d.toISOString().slice(0, 10);
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
      select: {
        id: true,
        name: true,
        code: true,
        payType: true,
        bpjsParticipant: true,
        bpjsEmployeeDeduction: true,
      },
    });
    if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');

    const attendance = await db.attendanceRecord.findMany({
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
    const attendedDates = new Set<string>();

    const records: PayrollRecord[] = attendance.map((r) => {
      const actualHours = r.actualHours == null ? null : toNum(r.actualHours);
      const overtimeHours = toNum(r.overtimeHours);
      const dailyEarnings = toNum(r.dailyEarnings);
      const overtimeEarnings = toNum(r.overtimeEarnings);
      const totalEarnings = toNum(r.totalEarnings);

      if (r.status === 'PRESENT') {
        daysWorked += 1;
        attendedDates.add(dateKeyFromWorkDate(r.workDate));
      }
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

    let totalPieceEarnings = 0;
    let totalKgPaid = 0;
    let totalKgUnpaid = 0;
    const pieceLines: PiecePayrollLine[] = [];
    const exceptions: PiecePayrollLine[] = [];

    if (employee.payType === 'PIECE') {
      // Extend query ±1 day to catch WIB midnight edge cases; gate by WIB date below.
      const { from, to } = weekQueryRange(weekStart, weekEnd);
      const executions = await db.productionExecution.findMany({
        where: {
          operatorId: employeeId,
          status: { not: 'VOIDED' },
          startTime: { gte: from, lte: to },
        },
        select: {
          id: true,
          startTime: true,
          quantityProduced: true,
          pieceRateSnapshot: true,
          pieceEarnings: true,
          pieceMachineType: true,
        },
        orderBy: { startTime: 'asc' },
      });

      for (const ex of executions) {
        const dateKey = wibDateStringFrom(ex.startTime);
        // Gate: only count executions whose WIB date falls within the actual week
        const weekStartKey = wibDateStringFrom(weekStart);
        const weekEndKey = wibDateStringFrom(weekEnd);
        if (dateKey < weekStartKey || dateKey > weekEndKey) continue;

        const qty = toNum(ex.quantityProduced);
        const rate = ex.pieceRateSnapshot == null ? null : toNum(ex.pieceRateSnapshot);
        const earnings = ex.pieceEarnings == null ? null : toNum(ex.pieceEarnings);
        const hasAttendance = attendedDates.has(dateKey);
        const hasRate = rate != null && rate > 0 && earnings != null;

        const line: PiecePayrollLine = {
          executionId: ex.id,
          date: new Date(dateKey + 'T00:00:00.000Z'),
          machineType: ex.pieceMachineType,
          quantityKg: qty,
          ratePerKg: rate,
          pieceEarnings: earnings,
          paid: false,
        };

        if (!hasAttendance) {
          line.reason = 'NO_ATTENDANCE';
          totalKgUnpaid += qty;
          exceptions.push(line);
          pieceLines.push(line);
          continue;
        }
        if (!hasRate) {
          line.reason = 'RATE_MISSING';
          totalKgUnpaid += qty;
          exceptions.push(line);
          pieceLines.push(line);
          continue;
        }

        line.paid = true;
        totalPieceEarnings += earnings!;
        totalKgPaid += qty;
        pieceLines.push(line);
      }

      // PIECE: attendance money must not pay (already zeroed at source, but force)
      totalDailyEarnings = 0;
      totalOvertimeEarnings = 0;
    }

    const totalEarnings =
      employee.payType === 'PIECE'
        ? totalPieceEarnings
        : totalDailyEarnings + totalOvertimeEarnings;

    // BPJS once/month on last week — only for shopfloor (DAILY/PIECE). MONTHLY uses payslip bulanan.
    const isBpjsWeek = isLastWeekOfMonth(weekStart, weekEnd);
    const isShopfloor =
      employee.payType === EmployeePayType.DAILY || employee.payType === EmployeePayType.PIECE;
    const bpjsDeduction =
      isShopfloor && isBpjsWeek && employee.bpjsParticipant
        ? Math.round(toNum(employee.bpjsEmployeeDeduction) * 100) / 100
        : 0;
    const netPay = Math.round((totalEarnings - bpjsDeduction) * 100) / 100;

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      employeeCode: employee.code,
      payType: employee.payType,
      weekStart,
      weekEnd,
      daysWorked,
      daysAbsent,
      totalActualHours: Math.round(totalActualHours * 100) / 100,
      totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
      totalDailyEarnings: Math.round(totalDailyEarnings * 100) / 100,
      totalOvertimeEarnings: Math.round(totalOvertimeEarnings * 100) / 100,
      totalPieceEarnings: Math.round(totalPieceEarnings * 100) / 100,
      totalKgPaid: Math.round(totalKgPaid * 100) / 100,
      totalKgUnpaid: Math.round(totalKgUnpaid * 100) / 100,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      bpjsDeduction,
      isBpjsWeek,
      netPay,
      records,
      pieceLines,
      exceptions,
    };
  },

  async getWeeklyPayrollForAll(
    db: PrismaClient,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<WeeklyPayroll[]> {
    const employees = await db.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
      orderBy: { code: 'asc' },
    });

    return Promise.all(
      employees.map((e) => this.getWeeklyPayroll(db, e.id, weekStart, weekEnd)),
    );
  },
};
