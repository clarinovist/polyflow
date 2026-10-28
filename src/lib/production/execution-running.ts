import type { Prisma, ProductionStatus } from '@prisma/client';
import { TERMINAL_STATUSES } from '@/lib/production/routing-run-terminal';

const MS_PER_HOUR = 3_600_000;

/**
 * A session is running only while its SPK is still open. Finishing an SPK from
 * the admin page used to leave its kiosk shell with `endTime` null; such a shell
 * is not running work and must not mark an operator or machine as busy.
 */
export const RUNNING_EXECUTION_WHERE = {
    endTime: null,
    status: { not: 'VOIDED' },
    productionOrder: {
        status: { notIn: [...TERMINAL_STATUSES] as ProductionStatus[] },
    },
} satisfies Prisma.ProductionExecutionWhereInput;

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
