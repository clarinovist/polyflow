import { describe, it, expect } from 'vitest';
import { isDateInRange, partitionScheduleOrders } from '../schedule-history';

describe('schedule-history', () => {
    const day = (iso: string) => new Date(iso);
    const week = [day('2026-07-27'), day('2026-07-28'), day('2026-07-29')];

    describe('isDateInRange', () => {
        it('date in range true', () => {
            expect(isDateInRange('2026-07-28', week)).toBe(true);
        });
        it('date out of range false', () => {
            expect(isDateInRange('2026-07-20', week)).toBe(false);
        });
        it('Date object in range true', () => {
            expect(isDateInRange(new Date('2026-07-27T00:00:00+07:00'), week)).toBe(true);
        });
    });

    describe('partitionScheduleOrders', () => {
        it('ongoing vs completedInWeek', () => {
            const orders = [
                { status: 'IN_PROGRESS', plannedStartDate: '2026-07-27' },
                { status: 'DRAFT', plannedStartDate: '2026-07-28' },
                { status: 'COMPLETED', plannedStartDate: '2026-07-28' },
                { status: 'COMPLETED', plannedStartDate: '2026-07-20' },
                { status: 'CANCELLED', plannedStartDate: '2026-07-27' },
            ];
            const res = partitionScheduleOrders(orders, week);
            expect(res.ongoing).toHaveLength(2);
            expect(res.completedInWeek).toHaveLength(1);
            expect(res.cancelledInWeek).toHaveLength(1);
            expect(res.outOfRangeCompleted).toHaveLength(1);
        });

        it('empty week returns all outOfRange', () => {
            const orders = [{ status: 'COMPLETED', plannedStartDate: '2026-07-20' }];
            const res = partitionScheduleOrders(orders, week);
            expect(res.completedInWeek).toHaveLength(0);
            expect(res.outOfRangeCompleted).toHaveLength(1);
        });

        it('RELEASED and WAITING_MATERIAL are ongoing', () => {
            const orders = [
                { status: 'RELEASED', plannedStartDate: '2026-07-27' },
                { status: 'WAITING_MATERIAL', plannedStartDate: '2026-07-27' },
            ];
            const res = partitionScheduleOrders(orders, week);
            expect(res.ongoing).toHaveLength(2);
        });
    });
});
