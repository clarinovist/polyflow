import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
    dispatchReminders,
    REMINDER_PAST_DAYS,
    REMINDER_AHEAD_DAYS,
} from '../employment-reminder';

// 2026-11-11 10:00 WIB
const NOW = new Date('2026-11-11T03:00:00.000Z');

function employee(
    id: string,
    contractEndDate: string,
    employmentStatus: 'CONTRACT' | 'PROBATION' = 'CONTRACT',
) {
    return {
        id,
        name: `Karyawan ${id}`,
        code: `K-${id}`,
        employmentStatus,
        probationEndDate: employmentStatus === 'PROBATION'
            ? new Date(contractEndDate)
            : null,
        contractEndDate: employmentStatus === 'CONTRACT'
            ? new Date(contractEndDate)
            : null,
    };
}

function buildDb(
    employees: ReturnType<typeof employee>[],
    existing: Array<{ userId: string; type: string; entityId: string }> = [],
) {
    const notification = {
        findMany: vi.fn().mockResolvedValue(existing),
        findFirst: vi.fn(),
        create: vi.fn(),
        createMany: vi
            .fn()
            .mockImplementation(async ({ data }: { data: unknown[] }) => ({
                count: data.length,
            })),
    };
    const db = {
        employee: { findMany: vi.fn().mockResolvedValue(employees) },
        user: {
            findMany: vi.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]),
        },
        notification,
    };
    return { db: db as unknown as PrismaClient, notification };
}

describe('dispatchReminders', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterEach(() => vi.useRealTimers());

    it('exposes a named window of 30 days back and 30 days ahead', () => {
        expect(REMINDER_PAST_DAYS).toBe(30);
        expect(REMINDER_AHEAD_DAYS).toBe(30);
    });

    it('ignores contracts that ended 60 days ago', async () => {
        const { db, notification } = buildDb([employee('a', '2026-09-12')]);
        const result = await dispatchReminders(db);
        expect(result).toEqual({ scanned: 0, created: 0 });
        expect(notification.createMany).not.toHaveBeenCalled();
    });

    it('ignores contracts ending beyond the look-ahead window', async () => {
        const { db } = buildDb([employee('a', '2026-12-20')]);
        const result = await dispatchReminders(db);
        expect(result.scanned).toBe(0);
    });

    it('includes recently overdue and upcoming contracts', async () => {
        const { db, notification } = buildDb([
            employee('a', '2026-10-20'),
            employee('b', '2026-12-05', 'PROBATION'),
        ]);
        const result = await dispatchReminders(db);
        expect(result).toEqual({ scanned: 2, created: 4 });
        const data = notification.createMany.mock.calls[0][0].data;
        expect(data).toHaveLength(4);
        expect(data[0].message).toContain('sudah lewat 22 hari');
    });

    it('uses one existing-notification query and one createMany', async () => {
        const { db, notification } = buildDb([
            employee('a', '2026-11-20'),
            employee('b', '2026-11-25'),
        ]);
        await dispatchReminders(db);
        expect(notification.findMany).toHaveBeenCalledTimes(1);
        expect(notification.createMany).toHaveBeenCalledTimes(1);
        expect(notification.findFirst).not.toHaveBeenCalled();
        expect(notification.create).not.toHaveBeenCalled();
    });

    it('skips user/employee combinations already notified today', async () => {
        const { db, notification } = buildDb(
            [employee('a', '2026-11-20')],
            [{ userId: 'u1', type: 'HRD_CONTRACT_EXPIRING', entityId: 'a' }],
        );
        const result = await dispatchReminders(db);
        expect(result.created).toBe(1);
        const data = notification.createMany.mock.calls[0][0].data;
        expect(data.map((d: { userId: string }) => d.userId)).toEqual(['u2']);
    });

    it('does not create anything when everything is already notified', async () => {
        const { db, notification } = buildDb(
            [employee('a', '2026-11-20')],
            [
                { userId: 'u1', type: 'HRD_CONTRACT_EXPIRING', entityId: 'a' },
                { userId: 'u2', type: 'HRD_CONTRACT_EXPIRING', entityId: 'a' },
            ],
        );
        const result = await dispatchReminders(db);
        expect(result).toEqual({ scanned: 1, created: 0 });
        expect(notification.createMany).not.toHaveBeenCalled();
    });

    it('queries today in WIB with an exclusive next-midnight upper bound', async () => {
        const { db, notification } = buildDb([employee('a', '2026-11-20')]);
        await dispatchReminders(db);
        const where = notification.findMany.mock.calls[0][0].where;
        expect(where.createdAt.gte).toEqual(
            new Date('2026-11-11T00:00:00+07:00'),
        );
        expect(where.createdAt.lt).toEqual(
            new Date('2026-11-12T00:00:00+07:00'),
        );
    });

    it('computes overdue days from the WIB calendar day, not server time', async () => {
        // 2026-11-11 18:00 UTC is already 12 Nov in WIB
        vi.setSystemTime(new Date('2026-11-11T18:00:00.000Z'));
        const { db, notification } = buildDb([employee('a', '2026-11-12')]);
        await dispatchReminders(db);
        const data = notification.createMany.mock.calls[0][0].data;
        expect(data[0].message).toContain('habis 0 hari');
    });
});
