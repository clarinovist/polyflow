/**
 * Salary history service — append-only snapshots on salary field change.
 * Gelombang B3.
 */

import type { PrismaClient, Prisma } from '@prisma/client';

const SALARY_FIELDS = [
  'payType',
  'dailyRate',
  'monthlySalary',
  'overtimeHourlyRate',
  'standardDayHours',
  'bpjsParticipant',
  'bpjsEmployeeDeduction',
  'bpjsEmployerCost',
] as const;

/** Build a diff of salary-critical fields between before and after. Returns null if no changes. */
export function buildSalaryChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of SALARY_FIELDS) {
    const oldV = before[f];
    const newV = after[f];
    if (oldV?.toString() !== newV?.toString()) {
      changes[f] = { from: oldV, to: newV };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

/** Create a salary history snapshot row. Call after updateEmployee when changes non-null. */
export async function createSalaryHistory(
  db: PrismaClient,
  employeeId: string,
  after: Record<string, unknown>,
  changes: Record<string, { from: unknown; to: unknown }>,
  changedById?: string,
) {
  return db.employeeSalaryHistory.create({
    data: {
      employeeId,
      changedById: changedById ?? null,
      payType: (after.payType as string) ?? null,
      dailyRate: after.dailyRate != null ? Number(after.dailyRate) : null,
      monthlySalary: after.monthlySalary != null ? Number(after.monthlySalary) : null,
      overtimeHourlyRate: after.overtimeHourlyRate != null ? Number(after.overtimeHourlyRate) : null,
      standardDayHours: after.standardDayHours != null ? Number(after.standardDayHours) : null,
      bpjsParticipant: (after.bpjsParticipant as boolean) ?? null,
      bpjsEmployeeDeduction: after.bpjsEmployeeDeduction != null ? Number(after.bpjsEmployeeDeduction) : null,
      bpjsEmployerCost: after.bpjsEmployerCost != null ? Number(after.bpjsEmployerCost) : null,
      changes: changes as unknown as Prisma.InputJsonValue,
    },
  });
}

/** List salary history for an employee, newest first. */
export async function listSalaryHistory(db: PrismaClient, employeeId: string) {
  return db.employeeSalaryHistory.findMany({
    where: { employeeId },
    orderBy: { changedAt: 'desc' },
    include: { changedBy: { select: { name: true, email: true } } },
  });
}
