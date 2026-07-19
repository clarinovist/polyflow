/**
 * Employment reminder service — scan for expiring probation/contracts
 * and dispatch notifications. Gelombang B1.
 *
 * Window: 30 days (including overdue).
 * Recipients: ADMIN + FINANCE.
 * Idempotent: 1 notification per user+type+entity+day(WIB).
 */

import type { PrismaClient } from '@prisma/client';
import { daysUntil } from './employee-directory-helpers';

const REMINDER_WINDOW_DAYS = 30;

interface ExpiringEmployee {
  id: string;
  name: string;
  code: string;
  employmentStatus: string;
  probationEndDate: Date | null;
  contractEndDate: Date | null;
}

/** Find ACTIVE employees with PROBATION/CONTRACT ending within window (including overdue). */
export async function findExpiringEmployees(db: PrismaClient): Promise<ExpiringEmployee[]> {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + REMINDER_WINDOW_DAYS);

  const employees = await db.employee.findMany({
    where: {
      status: 'ACTIVE',
      employmentStatus: { in: ['PROBATION', 'CONTRACT'] },
    },
    select: {
      id: true,
      name: true,
      code: true,
      employmentStatus: true,
      probationEndDate: true,
      contractEndDate: true,
    },
  });

  return employees.filter((emp) => {
    const endDate = emp.employmentStatus === 'PROBATION' ? emp.probationEndDate : emp.contractEndDate;
    if (!endDate) return false;
    const days = daysUntil(new Date(endDate), now);
    return days <= REMINDER_WINDOW_DAYS;
  });
}

/** Get today's date key in WIB (Asia/Jakarta) for idempotency. */
function todayWibKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
}

/** Check if notification already sent today for this user+type+entity. */
async function alreadyNotified(
  db: PrismaClient,
  userId: string,
  type: string,
  entityId: string,
): Promise<boolean> {
  const todayKey = todayWibKey();
  const existing = await db.notification.findFirst({
    where: {
      userId,
      type: type as never,
      entityId,
      createdAt: {
        gte: new Date(`${todayKey}T00:00:00+07:00`),
        lt: new Date(`${todayKey}T23:59:59+07:00`),
      },
    },
    select: { id: true },
  });
  return !!existing;
}

/** Dispatch reminders for expiring employees. Returns count of notifications created. */
export async function dispatchReminders(db: PrismaClient): Promise<{ scanned: number; created: number }> {
  const expiring = await findExpiringEmployees(db);
  if (expiring.length === 0) return { scanned: 0, created: 0 };

  // Find ADMIN + FINANCE users
  const recipients = await db.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: 'ADMIN' },
        { roles: { some: { role: 'ADMIN' } } },
        { role: 'FINANCE' },
        { roles: { some: { role: 'FINANCE' } } },
      ],
    },
    select: { id: true },
  });

  let created = 0;
  for (const emp of expiring) {
    const endDate = emp.employmentStatus === 'PROBATION' ? emp.probationEndDate : emp.contractEndDate;
    if (!endDate) continue;
    const days = daysUntil(new Date(endDate));
    const type = emp.employmentStatus === 'PROBATION' ? 'HRD_PROBATION_ENDING' : 'HRD_CONTRACT_EXPIRING';
    const statusText = days >= 0 ? `habis ${days} hari` : `sudah lewat ${Math.abs(days)} hari`;
    const title = emp.employmentStatus === 'PROBATION' ? 'Probation Berakhir' : 'Kontrak Berakhir';
    const message = `Kontrak/probation ${emp.code} — ${emp.name} ${statusText}.`;

    for (const recipient of recipients) {
      const exists = await alreadyNotified(db, recipient.id, type, emp.id);
      if (exists) continue;

      await db.notification.create({
        data: {
          userId: recipient.id,
          type: type as never,
          title,
          message,
          link: `/dashboard/employees/${emp.id}/edit`,
          entityType: 'Employee',
          entityId: emp.id,
        },
      });
      created++;
    }
  }

  return { scanned: expiring.length, created };
}
