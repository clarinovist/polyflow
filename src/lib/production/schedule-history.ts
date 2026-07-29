import { toBusinessDateString } from '@/lib/utils/timezone';

export type ScheduleOrderLike = {
    status: string;
    plannedStartDate: string | Date;
};

export function isDateInRange(date: Date | string, timelineDays: Date[]): boolean {
    try {
        const dStr = toBusinessDateString(date);
        return timelineDays.some((td) => toBusinessDateString(td) === dStr);
    } catch {
        return false;
    }
}

export interface PartitionResult<T extends ScheduleOrderLike> {
    ongoing: T[];
    completedInWeek: T[];
    cancelledInWeek: T[];
    outOfRangeCompleted: T[];
}

const ONGOING_STATUSES = new Set(['DRAFT', 'WAITING_MATERIAL', 'RELEASED', 'IN_PROGRESS']);
const COMPLETED = 'COMPLETED';
const CANCELLED = 'CANCELLED';

export function partitionScheduleOrders<T extends ScheduleOrderLike>(
    orders: T[],
    timelineDays: Date[],
): PartitionResult<T> {
    const ongoing: T[] = [];
    const completedInWeek: T[] = [];
    const cancelledInWeek: T[] = [];
    const outOfRangeCompleted: T[] = [];

    for (const o of orders) {
        if (ONGOING_STATUSES.has(o.status)) {
            ongoing.push(o);
        } else if (o.status === COMPLETED) {
            if (isDateInRange(o.plannedStartDate, timelineDays)) {
                completedInWeek.push(o);
            } else {
                outOfRangeCompleted.push(o);
            }
        } else if (o.status === CANCELLED) {
            if (isDateInRange(o.plannedStartDate, timelineDays)) {
                cancelledInWeek.push(o);
            } else {
                outOfRangeCompleted.push(o);
            }
        }
    }

    return { ongoing, completedInWeek, cancelledInWeek, outOfRangeCompleted };
}
