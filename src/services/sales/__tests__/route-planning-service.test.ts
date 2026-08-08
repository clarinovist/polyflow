import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPlanFindMany = vi.fn();
const mockVisitGroupBy = vi.fn();
const mockAssignmentFindMany = vi.fn();

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        salesRoutePlan: {
            findMany: (...args: unknown[]) => mockPlanFindMany(...args),
        },
        salesVisit: {
            groupBy: (...args: unknown[]) => mockVisitGroupBy(...args),
        },
        customerSalesAssignment: {
            findMany: (...args: unknown[]) => mockAssignmentFindMany(...args),
        },
    },
}));

import { getWeekBoard, getWeekDates } from '../route-planning-service';

// Senin, 2026-08-03 (UTC midnight)
const MONDAY = new Date('2026-08-03T00:00:00.000Z');
const NOW = new Date('2026-08-08T00:00:00.000Z'); // Sabtu minggu yang sama

describe('route-planning-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPlanFindMany.mockResolvedValue([]);
        mockVisitGroupBy.mockResolvedValue([]);
        mockAssignmentFindMany.mockResolvedValue([]);
    });

    describe('getWeekDates', () => {
        it('returns 6 consecutive dates (Senin–Sabtu) starting from weekStart', () => {
            const dates = getWeekDates(MONDAY);
            expect(dates).toHaveLength(6);
            expect(dates[0].toISOString().split('T')[0]).toBe('2026-08-03');
            expect(dates[5].toISOString().split('T')[0]).toBe('2026-08-08');
        });
    });

    describe('getWeekBoard — cakupan minggu (days/plans)', () => {
        it('returns a plan cell per rep per day, batched (no N+1)', async () => {
            mockPlanFindMany.mockResolvedValue([
                {
                    id: 'plan-1',
                    date: new Date('2026-08-03T00:00:00.000Z'),
                    userId: 'rep-1',
                    status: 'DRAFT',
                    items: [
                        { customerId: 'cus-1', status: 'PENDING' },
                        { customerId: 'cus-2', status: 'COMPLETED' },
                    ],
                },
            ]);

            const board = await getWeekBoard({
                weekStart: MONDAY,
                userIds: ['rep-1', 'rep-2'],
                now: NOW,
            });

            // Exactly 3 batched queries, never per rep/day.
            expect(mockPlanFindMany).toHaveBeenCalledTimes(1);
            expect(mockVisitGroupBy).toHaveBeenCalledTimes(1);
            expect(mockAssignmentFindMany).toHaveBeenCalledTimes(1);

            expect(board.days).toHaveLength(6);
            const monday = board.days[0];
            expect(monday.plans).toHaveLength(2); // rep-1, rep-2

            const rep1Cell = monday.plans.find((p) => p.userId === 'rep-1');
            expect(rep1Cell).toEqual({
                userId: 'rep-1',
                planId: 'plan-1',
                status: 'DRAFT',
                itemCount: 2,
                visitedCount: 1,
            });

            const rep2Cell = monday.plans.find((p) => p.userId === 'rep-2');
            expect(rep2Cell).toEqual({
                userId: 'rep-2',
                planId: null,
                status: null,
                itemCount: 0,
                visitedCount: 0,
            });
        });

        it('returns empty-but-shaped board for an empty week', async () => {
            const board = await getWeekBoard({
                weekStart: MONDAY,
                userIds: ['rep-1'],
                now: NOW,
            });

            expect(board.days).toHaveLength(6);
            for (const day of board.days) {
                expect(day.plans).toEqual([
                    {
                        userId: 'rep-1',
                        planId: null,
                        status: null,
                        itemCount: 0,
                        visitedCount: 0,
                    },
                ]);
            }
            expect(board.coverage).toEqual({
                activeCustomers: 0,
                scheduledThisWeek: 0,
            });
            expect(board.overdue).toEqual([]);
            expect(board.conflicts).toEqual([]);
            expect(board.lastVisits).toEqual([]);
        });

        it('short-circuits without querying when userIds is empty', async () => {
            const board = await getWeekBoard({
                weekStart: MONDAY,
                userIds: [],
                now: NOW,
            });

            expect(mockPlanFindMany).not.toHaveBeenCalled();
            expect(mockVisitGroupBy).not.toHaveBeenCalled();
            expect(mockAssignmentFindMany).not.toHaveBeenCalled();
            expect(board.days).toHaveLength(6);
            expect(board.days[0].plans).toEqual([]);
        });
    });

    describe('getWeekBoard — overdue di ambang batas persis 30 hari', () => {
        it('does NOT flag a customer visited exactly 30 days ago', async () => {
            mockAssignmentFindMany.mockResolvedValue([
                {
                    customerId: 'cus-30',
                    customer: { name: 'Toko Tepat 30 Hari' },
                },
            ]);
            const exactly30DaysAgo = new Date(
                NOW.getTime() - 30 * 24 * 60 * 60 * 1000,
            );
            mockVisitGroupBy.mockResolvedValue([
                {
                    customerId: 'cus-30',
                    _max: { checkInTime: exactly30DaysAgo },
                },
            ]);

            const board = await getWeekBoard({
                weekStart: MONDAY,
                userIds: ['rep-1'],
                now: NOW,
            });

            expect(
                board.overdue.find((o) => o.customerId === 'cus-30'),
            ).toBeUndefined();
        });

        it('DOES flag a customer visited 31 days ago (just past threshold)', async () => {
            mockAssignmentFindMany.mockResolvedValue([
                { customerId: 'cus-31', customer: { name: 'Toko 31 Hari' } },
            ]);
            const days31Ago = new Date(
                NOW.getTime() - 31 * 24 * 60 * 60 * 1000,
            );
            mockVisitGroupBy.mockResolvedValue([
                { customerId: 'cus-31', _max: { checkInTime: days31Ago } },
            ]);

            const board = await getWeekBoard({
                weekStart: MONDAY,
                userIds: ['rep-1'],
                now: NOW,
            });

            const entry = board.overdue.find(
                (o) => o.customerId === 'cus-31',
            );
            expect(entry).toBeDefined();
            expect(entry?.daysSince).toBe(31);
        });

        it('flags a customer that has never been visited (no SalesVisit row)', async () => {
            mockAssignmentFindMany.mockResolvedValue([
                {
                    customerId: 'cus-never',
                    customer: { name: 'Toko Belum Pernah' },
                },
            ]);
            mockVisitGroupBy.mockResolvedValue([]); // no visit rows at all

            const board = await getWeekBoard({
                weekStart: MONDAY,
                userIds: ['rep-1'],
                now: NOW,
            });

            const entry = board.overdue.find(
                (o) => o.customerId === 'cus-never',
            );
            expect(entry).toBeDefined();
            expect(entry?.lastVisitAt).toBeNull();
            expect(entry?.daysSince).toBeNull();
        });
    });

    describe('getWeekBoard — bentrok 2 rep di hari sama', () => {
        it('flags a customer routed to 2 different reps on the same date', async () => {
            mockPlanFindMany.mockResolvedValue([
                {
                    id: 'plan-a',
                    date: new Date('2026-08-04T00:00:00.000Z'),
                    userId: 'rep-1',
                    status: 'DRAFT',
                    items: [{ customerId: 'cus-shared', status: 'PENDING' }],
                },
                {
                    id: 'plan-b',
                    date: new Date('2026-08-04T00:00:00.000Z'),
                    userId: 'rep-2',
                    status: 'DRAFT',
                    items: [{ customerId: 'cus-shared', status: 'PENDING' }],
                },
            ]);
            mockAssignmentFindMany.mockResolvedValue([
                { customerId: 'cus-shared', customer: { name: 'Toko Rebutan' } },
            ]);

            const board = await getWeekBoard({
                weekStart: MONDAY,
                userIds: ['rep-1', 'rep-2'],
                now: NOW,
            });

            expect(board.conflicts).toHaveLength(1);
            expect(board.conflicts[0]).toMatchObject({
                customerId: 'cus-shared',
                name: 'Toko Rebutan',
                userIds: expect.arrayContaining(['rep-1', 'rep-2']),
            });
        });

        it('does not flag the same customer routed on different days', async () => {
            mockPlanFindMany.mockResolvedValue([
                {
                    id: 'plan-a',
                    date: new Date('2026-08-04T00:00:00.000Z'),
                    userId: 'rep-1',
                    status: 'DRAFT',
                    items: [{ customerId: 'cus-x', status: 'PENDING' }],
                },
                {
                    id: 'plan-b',
                    date: new Date('2026-08-05T00:00:00.000Z'),
                    userId: 'rep-2',
                    status: 'DRAFT',
                    items: [{ customerId: 'cus-x', status: 'PENDING' }],
                },
            ]);

            const board = await getWeekBoard({
                weekStart: MONDAY,
                userIds: ['rep-1', 'rep-2'],
                now: NOW,
            });

            expect(board.conflicts).toEqual([]);
        });
    });

    describe('getWeekBoard — coverage', () => {
        it('counts active assigned customers and distinct scheduled customers', async () => {
            mockAssignmentFindMany.mockResolvedValue([
                { customerId: 'cus-1', customer: { name: 'A' } },
                { customerId: 'cus-2', customer: { name: 'B' } },
                { customerId: 'cus-3', customer: { name: 'C' } },
            ]);
            mockPlanFindMany.mockResolvedValue([
                {
                    id: 'plan-1',
                    date: new Date('2026-08-03T00:00:00.000Z'),
                    userId: 'rep-1',
                    status: 'DRAFT',
                    items: [
                        { customerId: 'cus-1', status: 'PENDING' },
                        { customerId: 'cus-2', status: 'PENDING' },
                    ],
                },
                {
                    id: 'plan-2',
                    date: new Date('2026-08-04T00:00:00.000Z'),
                    userId: 'rep-1',
                    status: 'DRAFT',
                    // cus-1 scheduled again on a different day — must not double count
                    items: [{ customerId: 'cus-1', status: 'PENDING' }],
                },
            ]);

            const board = await getWeekBoard({
                weekStart: MONDAY,
                userIds: ['rep-1'],
                now: NOW,
            });

            expect(board.coverage).toEqual({
                activeCustomers: 3,
                scheduledThisWeek: 2, // cus-1, cus-2 (distinct)
            });
        });
    });

    describe('getWeekBoard — lastVisits (umur kunjungan per stop, R6)', () => {
        it('covers every assigned customer, not just the overdue ones, from the same batched queries', async () => {
            mockAssignmentFindMany.mockResolvedValue([
                { customerId: 'cus-never', customer: { name: 'Belum Pernah' } },
                { customerId: 'cus-recent', customer: { name: 'Baru Kemarin' } },
                { customerId: 'cus-overdue', customer: { name: 'Lama Sekali' } },
            ]);
            const yesterday = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000);
            const days60Ago = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
            mockVisitGroupBy.mockResolvedValue([
                { customerId: 'cus-recent', _max: { checkInTime: yesterday } },
                { customerId: 'cus-overdue', _max: { checkInTime: days60Ago } },
                // cus-never: sengaja tidak punya row SalesVisit sama sekali.
            ]);

            const board = await getWeekBoard({
                weekStart: MONDAY,
                userIds: ['rep-1'],
                now: NOW,
            });

            // Masih 3 query batched — tidak ada roundtrip tambahan per stop.
            expect(mockPlanFindMany).toHaveBeenCalledTimes(1);
            expect(mockVisitGroupBy).toHaveBeenCalledTimes(1);
            expect(mockAssignmentFindMany).toHaveBeenCalledTimes(1);

            expect(board.lastVisits).toHaveLength(3);

            const never = board.lastVisits.find(
                (v) => v.customerId === 'cus-never',
            );
            expect(never?.lastVisitAt).toBeNull();
            expect(never?.daysSince).toBeNull();

            const recent = board.lastVisits.find(
                (v) => v.customerId === 'cus-recent',
            );
            expect(recent?.daysSince).toBe(1);

            const overdue = board.lastVisits.find(
                (v) => v.customerId === 'cus-overdue',
            );
            expect(overdue?.daysSince).toBe(60);

            // overdue tetap subset dari lastVisits (hanya yang > ambang / null).
            expect(board.overdue.map((o) => o.customerId).sort()).toEqual(
                ['cus-never', 'cus-overdue'].sort(),
            );
            // cus-recent (1 hari) TIDAK masuk overdue, tapi tetap ada di lastVisits.
            expect(
                board.overdue.find((o) => o.customerId === 'cus-recent'),
            ).toBeUndefined();
        });
    });
});
