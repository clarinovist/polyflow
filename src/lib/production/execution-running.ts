import { TERMINAL_STATUSES } from '@/lib/production/routing-run-terminal';

const MS_PER_HOUR = 3_600_000;

/**
 * Hours an execution charges to conversion cost. An open shell on a finished
 * SPK charges nothing until a closure writes its `endTime`; only a shell on an
 * open SPK accrues up to `now`.
 */
export function executionCostHours(
    execution: { startTime: Date; endTime: Date | null },
    orderStatus: string,
    now: Date = new Date(),
): number {
    const startTime = new Date(execution.startTime);
    const endTime = execution.endTime
        ? new Date(execution.endTime)
        : TERMINAL_STATUSES.has(orderStatus)
          ? startTime
          : now;
    return Math.max(0, endTime.getTime() - startTime.getTime()) / MS_PER_HOUR;
}
