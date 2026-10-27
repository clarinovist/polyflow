import { executionScrapTotal } from './execution-scrap';

type ExecutionLike = {
    status: string;
    createdAt: Date | string;
    updatedAt: Date | string;
    scrapQuantity?: unknown;
    scrapProngkolQty?: unknown;
    scrapDaunQty?: unknown;
};

export interface VoidedAffalReference {
    voidedAt: Date;
    prongkol: number;
    daun: number;
    total: number;
}

/**
 * Affal of the most recent voided entry that has not been re-entered yet.
 *
 * A revision that drops affal leaves the material it consumed in stock, so the
 * output form shows the voided figures as a reminder. A voided row's updatedAt
 * is its void time; any entry recorded after it counts as the re-entry.
 */
export function voidedAffalAwaitingReentry(
    executions: readonly ExecutionLike[],
): VoidedAffalReference | null {
    const voided = executions
        .filter((execution) => execution.status === 'VOIDED')
        .map((execution) => ({
            execution,
            voidedAt: new Date(execution.updatedAt),
        }))
        .sort((a, b) => b.voidedAt.getTime() - a.voidedAt.getTime())[0];
    if (!voided) return null;
    const reentered = executions.some(
        (execution) =>
            new Date(execution.createdAt).getTime() > voided.voidedAt.getTime(),
    );
    const total = executionScrapTotal(voided.execution);
    if (reentered || total <= 0) return null;
    return {
        voidedAt: voided.voidedAt,
        prongkol: Number(voided.execution.scrapProngkolQty ?? 0),
        daun: Number(voided.execution.scrapDaunQty ?? 0),
        total,
    };
}
