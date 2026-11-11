/**
 * Employment reminder service — scan for expiring probation/contracts
 * and dispatch notifications. Gelombang B1.
 *
 * Window: REMINDER_PAST_DAYS back to REMINDER_AHEAD_DAYS ahead (WIB calendar
 * days), so a contract that lapsed long ago stops generating new alerts.
 * Recipients: ADMIN + FINANCE + HRD.
 * Idempotent: 1 notification per user+type+entity+day(WIB), de-duplicated
 * with a single batch lookup.
 */

import type { NotificationType, PrismaClient } from '@prisma/client';
import { wibDateFrom, wibDateStringFrom } from '@/services/hrd/shift-window';

export const REMINDER_PAST_DAYS = 30;
export const REMINDER_AHEAD_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const HR_ALERT_TYPES: NotificationType[] = [
    'HRD_PROBATION_ENDING',
    'HRD_CONTRACT_EXPIRING',
];

interface ExpiringEmployee {
    id: string;
    name: string;
    code: string;
    employmentStatus: string;
    endDate: Date;
    days: number;
}

/** Whole WIB calendar days from `asOf` to `target` (negative = overdue). */
function wibDaysUntil(target: Date, asOf: Date): number {
    return Math.round(
        (wibDateFrom(target).getTime() - wibDateFrom(asOf).getTime()) /
            MS_PER_DAY,
    );
}

function reminderTypeFor(employmentStatus: string): NotificationType {
    return employmentStatus === 'PROBATION'
        ? 'HRD_PROBATION_ENDING'
        : 'HRD_CONTRACT_EXPIRING';
}

/** Find ACTIVE employees with PROBATION/CONTRACT ending inside the window. */
async function findExpiringEmployees(
    db: PrismaClient,
    now: Date,
): Promise<ExpiringEmployee[]> {
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

    return employees.flatMap((emp) => {
        const endDate =
            emp.employmentStatus === 'PROBATION'
                ? emp.probationEndDate
                : emp.contractEndDate;
        if (!endDate) return [];
        const days = wibDaysUntil(new Date(endDate), now);
        if (days < -REMINDER_PAST_DAYS || days > REMINDER_AHEAD_DAYS) {
            return [];
        }
        return [
            {
                id: emp.id,
                name: emp.name,
                code: emp.code,
                employmentStatus: emp.employmentStatus,
                endDate: new Date(endDate),
                days,
            },
        ];
    });
}

/** Keys (user:type:entity) of reminders already created today (WIB). */
async function findNotifiedToday(
    db: PrismaClient,
    now: Date,
    userIds: string[],
    entityIds: string[],
): Promise<Set<string>> {
    const dayStart = new Date(`${wibDateStringFrom(now)}T00:00:00+07:00`);
    const nextDayStart = new Date(dayStart.getTime() + MS_PER_DAY);
    const existing = await db.notification.findMany({
        where: {
            userId: { in: userIds },
            type: { in: HR_ALERT_TYPES },
            entityId: { in: entityIds },
            createdAt: { gte: dayStart, lt: nextDayStart },
        },
        select: { userId: true, type: true, entityId: true },
    });
    return new Set(
        existing.map((n) => `${n.userId}:${n.type}:${n.entityId}`),
    );
}

function buildMessage(emp: ExpiringEmployee): string {
    const statusText =
        emp.days >= 0
            ? `habis ${emp.days} hari`
            : `sudah lewat ${Math.abs(emp.days)} hari`;
    return `Kontrak/probation ${emp.code} — ${emp.name} ${statusText}.`;
}

/** Dispatch reminders for expiring employees. Returns count of notifications created. */
export async function dispatchReminders(
    db: PrismaClient,
): Promise<{ scanned: number; created: number }> {
    const now = new Date();
    const expiring = await findExpiringEmployees(db, now);
    if (expiring.length === 0) return { scanned: 0, created: 0 };

    const recipients = await db.user.findMany({
        where: {
            isActive: true,
            OR: [
                { role: 'ADMIN' },
                { roles: { some: { role: 'ADMIN' } } },
                { role: 'FINANCE' },
                { roles: { some: { role: 'FINANCE' } } },
                { role: 'HRD' },
                { roles: { some: { role: 'HRD' } } },
            ],
        },
        select: { id: true },
    });
    if (recipients.length === 0) return { scanned: expiring.length, created: 0 };

    const notified = await findNotifiedToday(
        db,
        now,
        recipients.map((r) => r.id),
        expiring.map((e) => e.id),
    );

    const data = expiring.flatMap((emp) => {
        const type = reminderTypeFor(emp.employmentStatus);
        const title =
            type === 'HRD_PROBATION_ENDING'
                ? 'Probation Berakhir'
                : 'Kontrak Berakhir';
        const message = buildMessage(emp);
        return recipients
            .filter((r) => !notified.has(`${r.id}:${type}:${emp.id}`))
            .map((r) => ({
                userId: r.id,
                type,
                title,
                message,
                link: `/dashboard/employees/${emp.id}/edit`,
                entityType: 'Employee',
                entityId: emp.id,
            }));
    });

    if (data.length === 0) return { scanned: expiring.length, created: 0 };
    const result = await db.notification.createMany({ data });
    return { scanned: expiring.length, created: result.count };
}
