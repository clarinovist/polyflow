import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
    STALE_SESSION_LIMIT,
    STALE_SESSION_LOOKBACK_DAYS,
    findStaleOpenSessions,
} from '../attendance-query-service';

// 2026-11-11 10:00 WIB
const NOW = new Date('2026-11-11T03:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

const SHIFT = {
    id: 'shift-1',
    name: 'Shift Malam',
    startTime: '20:00',
    endTime: '08:00',
};

function row(overrides: Record<string, unknown> = {}) {
    return {
        id: 'rec-1',
        employeeId: 'emp-1',
        workDate: new Date('2026-11-09T00:00:00.000Z'),
        clockInAt: new Date(NOW.getTime() - 30 * HOUR_MS),
        clockOutAt: null,
        employee: { name: 'Budi Contoh', code: 'E001' },
        workShift: SHIFT,
        ...overrides,
    };
}

function dbWith(rows: unknown[]) {
    const findMany = vi.fn().mockResolvedValue(rows);
    const db = { attendanceRecord: { findMany } } as unknown as PrismaClient;
    return { db, findMany };
}

describe('findStaleOpenSessions', () => {
    it('maps a row to the session shape with rounded open hours', async () => {
        const { db } = dbWith([
            row({ clockInAt: new Date(NOW.getTime() - 25.46 * HOUR_MS) }),
        ]);

        const result = await findStaleOpenSessions(db, NOW);

        expect(result.truncated).toBe(false);
        expect(result.sessions).toEqual([
            {
                id: 'rec-1',
                employeeId: 'emp-1',
                employeeName: 'Budi Contoh',
                employeeCode: 'E001',
                workDate: '2026-11-09',
                clockInAt: new Date(
                    NOW.getTime() - 25.46 * HOUR_MS,
                ).toISOString(),
                shift: SHIFT,
                openHours: 25.5,
            },
        ]);
    });

    it('runs exactly one query with the stale filter and relations', async () => {
        const { db, findMany } = dbWith([]);

        await findStaleOpenSessions(db, NOW);

        expect(findMany).toHaveBeenCalledTimes(1);
        const args = findMany.mock.calls[0][0];
        expect(args.where.status).toBe('PRESENT');
        expect(args.where.clockOutAt).toBeNull();
        expect(args.where.clockInAt).toEqual({
            lt: new Date(NOW.getTime() - 20 * HOUR_MS),
        });
        expect(args.include).toEqual({
            employee: { select: { name: true, code: true } },
            workShift: {
                select: {
                    id: true,
                    name: true,
                    startTime: true,
                    endTime: true,
                },
            },
        });
    });

    it('limits workDate to the last 60 days in WIB', async () => {
        const { db, findMany } = dbWith([]);

        await findStaleOpenSessions(db, NOW);

        expect(STALE_SESSION_LOOKBACK_DAYS).toBe(60);
        const { workDate } = findMany.mock.calls[0][0].where;
        expect(workDate).toEqual({
            gte: new Date('2026-09-12T00:00:00.000Z'),
        });
    });

    it('orders by workDate desc then clockInAt desc', async () => {
        const { db, findMany } = dbWith([]);

        await findStaleOpenSessions(db, NOW);

        expect(findMany.mock.calls[0][0].orderBy).toEqual([
            { workDate: 'desc' },
            { clockInAt: 'desc' },
        ]);
    });

    it('drops a row exactly 20 hours old (not yet stale)', async () => {
        const { db } = dbWith([
            row({ id: 'exact', clockInAt: new Date(NOW.getTime() - 20 * HOUR_MS) }),
            row({
                id: 'over',
                clockInAt: new Date(NOW.getTime() - 20 * HOUR_MS - 1000),
            }),
        ]);

        const result = await findStaleOpenSessions(db, NOW);

        expect(result.sessions.map((s) => s.id)).toEqual(['over']);
    });

    it('drops rows that are closed or have no clock-in', async () => {
        const { db } = dbWith([
            row({ id: 'closed', clockOutAt: new Date(NOW.getTime() - HOUR_MS) }),
            row({ id: 'no-in', clockInAt: null }),
            row({ id: 'ok' }),
        ]);

        const result = await findStaleOpenSessions(db, NOW);

        expect(result.sessions.map((s) => s.id)).toEqual(['ok']);
    });

    it('requests one extra row and flags truncation at the limit', async () => {
        const rows = Array.from({ length: STALE_SESSION_LIMIT + 1 }, (_, i) =>
            row({ id: `rec-${i}` }),
        );
        const { db, findMany } = dbWith(rows);

        const result = await findStaleOpenSessions(db, NOW);

        expect(findMany.mock.calls[0][0].take).toBe(STALE_SESSION_LIMIT + 1);
        expect(result.truncated).toBe(true);
        expect(result.sessions).toHaveLength(STALE_SESSION_LIMIT);
    });

    it('does not flag truncation when rows fit within the limit', async () => {
        const rows = Array.from({ length: STALE_SESSION_LIMIT }, (_, i) =>
            row({ id: `rec-${i}` }),
        );
        const { db } = dbWith(rows);

        const result = await findStaleOpenSessions(db, NOW);

        expect(result.truncated).toBe(false);
        expect(result.sessions).toHaveLength(STALE_SESSION_LIMIT);
    });

    it('propagates database failures instead of returning an empty list', async () => {
        const findMany = vi.fn().mockRejectedValue(new Error('db down'));
        const db = { attendanceRecord: { findMany } } as unknown as PrismaClient;

        await expect(findStaleOpenSessions(db, NOW)).rejects.toThrow('db down');
    });
});
