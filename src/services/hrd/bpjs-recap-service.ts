/**
 * HRD BPJS company remittance recap (read-only compose).
 * Shopfloor (DAILY/PIECE): potong di minggu yang memuat akhir bulan.
 * MONTHLY: potongan dari payslip periode.
 */

import type { PrismaClient } from '@prisma/client';
import { endOfWeek, startOfWeek } from '@/services/hrd/week-range';

export type BpjsSource = 'WEEKLY_LAST' | 'MONTHLY_SLIP' | 'NONE';

export interface BpjsRecapRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  payType: string;
  status: string;
  bpjsKesehatanNo: string | null;
  bpjsKetenagakerjaanNo: string | null;
  employeeDeductionMaster: number;
  employerCostMaster: number;
  actualDeducted: number;
  source: BpjsSource;
}

export interface BpjsRecapResult {
  year: number;
  month: number;
  bpjsWeekStart: string;
  bpjsWeekEnd: string;
  rows: BpjsRecapRow[];
  totals: {
    participants: number;
    sumEmployeeDeductionMaster: number;
    sumEmployerCostMaster: number;
    sumActualDeducted: number;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Last calendar day of month as UTC midnight. */
function monthEndUtc(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

export const BpjsRecapService = {
  async getRecap(db: PrismaClient, year: number, month: number): Promise<BpjsRecapResult> {
    const monthEnd = monthEndUtc(year, month);
    const weekStart = startOfWeek(monthEnd);
    const weekEnd = endOfWeek(monthEnd);

    const [employees, period] = await Promise.all([
      db.employee.findMany({
        where: { bpjsParticipant: true },
        select: {
          id: true,
          code: true,
          name: true,
          payType: true,
          status: true,
          bpjsEmployeeDeduction: true,
          bpjsEmployerCost: true,
          bpjsKesehatanNo: true,
          bpjsKetenagakerjaanNo: true,
        },
        orderBy: { code: 'asc' },
      }),
      db.payrollPeriod.findFirst({
        where: { year, month },
        select: { id: true },
      }),
    ]);

    const payslipByEmp = new Map<string, number>();
    if (period) {
      const slips = await db.payslip.findMany({
        where: { payrollPeriodId: period.id },
        select: { employeeId: true, bpjsDeduction: true },
      });
      for (const s of slips) {
        payslipByEmp.set(s.employeeId, Number(s.bpjsDeduction));
      }
    }

    const rows: BpjsRecapRow[] = employees.map((e) => {
      const empMaster = e.bpjsEmployeeDeduction != null ? Number(e.bpjsEmployeeDeduction) : 0;
      const empEmployer = e.bpjsEmployerCost != null ? Number(e.bpjsEmployerCost) : 0;
      const isShopfloor = e.payType === 'DAILY' || e.payType === 'PIECE';

      let actualDeducted = 0;
      let source: BpjsSource = 'NONE';

      if (isShopfloor) {
        // Same rule as PayrollService: full master on last week of month
        actualDeducted = round2(empMaster);
        source = 'WEEKLY_LAST';
      } else if (e.payType === 'MONTHLY') {
        if (payslipByEmp.has(e.id)) {
          actualDeducted = round2(payslipByEmp.get(e.id)!);
          source = 'MONTHLY_SLIP';
        } else {
          actualDeducted = 0;
          source = 'NONE';
        }
      }

      return {
        employeeId: e.id,
        employeeCode: e.code,
        employeeName: e.name,
        payType: e.payType,
        status: e.status,
        bpjsKesehatanNo: e.bpjsKesehatanNo,
        bpjsKetenagakerjaanNo: e.bpjsKetenagakerjaanNo,
        employeeDeductionMaster: round2(empMaster),
        employerCostMaster: round2(empEmployer),
        actualDeducted,
        source,
      };
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.participants += 1;
        acc.sumEmployeeDeductionMaster += r.employeeDeductionMaster;
        acc.sumEmployerCostMaster += r.employerCostMaster;
        acc.sumActualDeducted += r.actualDeducted;
        return acc;
      },
      {
        participants: 0,
        sumEmployeeDeductionMaster: 0,
        sumEmployerCostMaster: 0,
        sumActualDeducted: 0,
      },
    );

    return {
      year,
      month,
      bpjsWeekStart: weekStart.toISOString(),
      bpjsWeekEnd: weekEnd.toISOString(),
      rows,
      totals: {
        participants: totals.participants,
        sumEmployeeDeductionMaster: round2(totals.sumEmployeeDeductionMaster),
        sumEmployerCostMaster: round2(totals.sumEmployerCostMaster),
        sumActualDeducted: round2(totals.sumActualDeducted),
      },
    };
  },
};
