'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma as db } from '@/lib/core/prisma';
import { PayrollService } from '@/services/hrd/payroll-service';
import { startOfWeek, endOfWeek } from '@/services/hrd/week-range';
import { AttendanceService } from '@/services/hrd/attendance-service';
import { getEmployeeSession } from '@/lib/auth/employee-session';
import { PayrollMonthlyService } from '@/services/hrd/payroll-monthly-service';

/**
 * Semua action self-service tidak menerima employeeId dari client.
 * Selalu ambil dari session -> tidak bisa IDOR.
 */

export const getMyWeeklyPayroll = withTenant(async function getMyWeeklyPayroll(dateInWeek?: string) {
  try {
    const session = await getEmployeeSession();
    if (!session) return { success: false, error: 'Unauthorized' };
    const base = dateInWeek ? new Date(dateInWeek) : new Date();
    const ws = startOfWeek(base);
    const we = endOfWeek(base);
    const data = await PayrollService.getWeeklyPayroll(db, session.employeeId, ws, we);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message || 'Gagal memuat gaji' };
  }
});

export const getMyAttendanceMonth = withTenant(async function getMyAttendanceMonth(year: number, month: number) {
  try {
    const session = await getEmployeeSession();
    if (!session) return { success: false, error: 'Unauthorized' };
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0));
    const data = await AttendanceService.listByEmployee(db, session.employeeId, from, to);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message || 'Gagal memuat absensi' };
  }
});

export const getMyProductions = withTenant(async function getMyProductions(from?: string, to?: string) {
  try {
    const session = await getEmployeeSession();
    if (!session) return { success: false, error: 'Unauthorized' };
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const executions = await db.productionExecution.findMany({
      where: {
        operatorId: session.employeeId,
        startTime: { gte: fromDate, lte: toDate },
      },
      orderBy: { startTime: 'desc' },
      take: 50,
      include: {
        productionOrder: {
          select: {
            orderNumber: true,
            bom: { select: { productVariant: { select: { name: true, skuCode: true } } } },
          },
        },
        machine: { select: { name: true } },
      },
    });

    return {
      success: true,
      data: executions.map((ex) => ({
        id: ex.id,
        orderNumber: ex.productionOrder.orderNumber,
        productName: ex.productionOrder.bom.productVariant.name,
        machineName: ex.machine?.name ?? '-',
        quantity: Number(ex.quantityProduced),
        pieceEarnings: ex.pieceEarnings ? Number(ex.pieceEarnings) : null,
        startTime: ex.startTime,
        endTime: ex.endTime,
      })),
    };
  } catch (e) {
    return { success: false, error: (e as Error).message || 'Gagal memuat produksi' };
  }
});

export const getMyPayslips = withTenant(async function getMyPayslips() {
  try {
    const session = await getEmployeeSession();
    if (!session) return { success: false, error: 'Unauthorized' };
    const data = await PayrollMonthlyService.listByEmployee(db, session.employeeId);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: (e as Error).message || 'Gagal memuat slip' };
  }
});

export const getMyLoansAndBpjs = withTenant(async function getMyLoansAndBpjs() {
  try {
    const session = await getEmployeeSession();
    if (!session) return { success: false, error: 'Unauthorized' };
    const [loans, employee] = await Promise.all([
      db.employeeLoan.findMany({
        where: { employeeId: session.employeeId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { payments: { select: { amount: true, paidAt: true } } },
      }),
      db.employee.findUnique({
        where: { id: session.employeeId },
        select: {
          bpjsParticipant: true,
          bpjsEmployeeDeduction: true,
          bpjsKesehatanNo: true,
          bpjsKetenagakerjaanNo: true,
          bankName: true,
          bankAccountNo: true,
          monthlySalary: true,
          dailyRate: true,
        },
      }),
    ]);
    return {
      success: true,
      data: {
        loans: loans.map((l) => ({
          id: l.id,
          loanNumber: l.loanNumber,
          amount: Number(l.principalAmount),
          remaining: Number(l.remainingBalance ?? l.principalAmount),
          status: l.status,
          type: l.repaymentType,
        })),
        bpjs: employee
          ? {
              participant: employee.bpjsParticipant,
              deduction: employee.bpjsEmployeeDeduction ? Number(employee.bpjsEmployeeDeduction) : 0,
              kesNo: employee.bpjsKesehatanNo,
              ketNo: employee.bpjsKetenagakerjaanNo,
            }
          : null,
        salary: employee
          ? {
              monthly: employee.monthlySalary ? Number(employee.monthlySalary) : null,
              daily: employee.dailyRate ? Number(employee.dailyRate) : null,
              bankName: employee.bankName,
              bankNo: employee.bankAccountNo,
            }
          : null,
      },
    };
  } catch (e) {
    return { success: false, error: (e as Error).message || 'Gagal memuat data' };
  }
});
