import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/core/prisma';
import { PayslipPrintView } from '@/components/hrd/PayslipPrintView';
import { hasAnyRole } from '@/lib/auth/roles';

export default async function PrintPayslipPage({
  params,
  searchParams,
}: {
  params: Promise<{ periodId: string }>;
  searchParams: Promise<{ payslipId?: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  if (!hasAnyRole(session.user, ['ADMIN', 'FINANCE', 'HRD'])) redirect('/hrd/payroll-monthly');

  const { periodId } = await params;
  const { payslipId } = await searchParams;

  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) redirect('/hrd/payroll-monthly');

  const where = payslipId
    ? { id: payslipId, payrollPeriodId: periodId }
    : { payrollPeriodId: periodId };

  const payslips = await prisma.payslip.findMany({
    where,
    include: {
      employee: { select: { id: true, name: true, code: true } },
      allowances: true,
      loanPayments: { include: { loan: { select: { loanNumber: true } } } },
    },
    orderBy: { employee: { code: 'asc' } },
  });

  return (
    <PayslipPrintView
      period={{ year: period.year, month: period.month, status: period.status }}
      payslips={payslips.map(p => ({
        ...p,
        baseSalary: Number(p.baseSalary),
        allowanceTotal: Number(p.allowanceTotal),
        thrAmount: Number(p.thrAmount),
        prorationDeduction: Number(p.prorationDeduction),
        grossPay: Number(p.grossPay),
        bpjsDeduction: Number(p.bpjsDeduction),
        loanDeduction: Number(p.loanDeduction),
        otherDeductions: Number(p.otherDeductions),
        deductionTotal: Number(p.deductionTotal),
        netPay: Number(p.netPay),
        allowances: p.allowances.map(a => ({ ...a, amount: Number(a.amount) })),
        loanPayments: p.loanPayments.map(lp => ({ ...lp, amount: Number(lp.amount) })),
      }))}
    />
  );
}
