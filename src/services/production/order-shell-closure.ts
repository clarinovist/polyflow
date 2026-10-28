import { Prisma, type ProductionExecution } from '@prisma/client';
import { ApplicationError } from '@/lib/errors/errors';
import { readCostPeriod } from '@/services/accounting/production-cost-period';
import { buildPieceSnapshotForOperator } from '@/services/hrd/piece-rate-helpers';
import {
    isShellCloseAtLastOutput,
    SHELL_CLOSE_SETTING_KEY,
} from '@/services/settings/shell-close-setting-service';

export const AUTO_CLOSE_NOTE = '[Ditutup otomatis saat SPK selesai]';

export interface ShellClosureResult {
    closed: Array<{ id: string; endTime: Date }>;
    /** Shells sealed by a cost boundary; updating them would break its hash. */
    skippedFrozen: string[];
    /** Boundary receipt failed validation, so no shell could be proven unfrozen. */
    costPeriodUnreadable: boolean;
    /** Rule applied: last output on the same machine, or a zero-length session. */
    atLastOutput: boolean;
}

/** Executions sealed by the WO's cost boundary; `null` when its receipt is unreadable. */
export async function frozenExecutionIds(
    tx: Prisma.TransactionClient,
    orderId: string,
) {
    try {
        return new Set((await readCostPeriod(tx, orderId))?.executionIds ?? []);
    } catch (error) {
        // Closing shells must never block completing a WO; leave them open instead.
        if (
            error instanceof ApplicationError &&
            error.code === 'PRODUCTION_COST_PERIOD_INVALID'
        )
            return null;
        throw error;
    }
}

async function readAtLastOutput(tx: Prisma.TransactionClient) {
    const row = await tx.appSetting.findUnique({
        where: { key: SHELL_CLOSE_SETTING_KEY },
        select: { value: true },
    });
    return isShellCloseAtLastOutput(row?.value);
}

/**
 * Where a shell ends under the given rule. Takes no lock, so a read-only
 * dry-run can plan the exact end that `closeOpenShellsForOrder` will write.
 */
export async function resolveShellEndTime(
    tx: Prisma.TransactionClient,
    shell: Pick<
        ProductionExecution,
        'id' | 'productionOrderId' | 'machineId' | 'startTime'
    >,
    atLastOutput: boolean,
): Promise<Date> {
    if (!atLastOutput) return shell.startTime;
    const lastOutput = await tx.productionExecution.aggregate({
        _max: { endTime: true },
        where: {
            productionOrderId: shell.productionOrderId,
            id: { not: shell.id },
            status: { not: 'VOIDED' },
            machineId: shell.machineId ?? null,
            endTime: { gte: shell.startTime },
        },
    });
    const outputEnd = lastOutput._max.endTime;
    return outputEnd && outputEnd > shell.startTime
        ? outputEnd
        : shell.startTime;
}

/**
 * End the running shells of a WO that is being closed. A shell is machine
 * context only; its outputs are separate executions. The end follows the
 * tenant setting (or `options.atLastOutput`). No stock, journal or quantity
 * changes. Idempotent; takes the WO lock itself.
 */
export async function closeOpenShellsForOrder(
    tx: Prisma.TransactionClient,
    productionOrderId: string,
    options: { atLastOutput?: boolean } = {},
): Promise<ShellClosureResult> {
    await tx.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id = ${productionOrderId} FOR UPDATE`;
    const shells = await tx.productionExecution.findMany({
        where: { productionOrderId, endTime: null, status: { not: 'VOIDED' } },
        orderBy: { startTime: 'asc' },
    });
    const result: ShellClosureResult = {
        closed: [],
        skippedFrozen: [],
        costPeriodUnreadable: false,
        atLastOutput: false,
    };
    if (!shells.length) return result;
    const frozen = await frozenExecutionIds(tx, productionOrderId);
    if (!frozen) return { ...result, costPeriodUnreadable: true };
    result.atLastOutput = options.atLastOutput ?? (await readAtLastOutput(tx));

    for (const shell of shells) {
        if (frozen.has(shell.id)) {
            result.skippedFrozen.push(shell.id);
            continue;
        }
        const endTime = await resolveShellEndTime(
            tx,
            shell,
            result.atLastOutput,
        );
        const pieceSnapshot = await buildPieceSnapshotForOperator(tx, {
            operatorId: shell.operatorId,
            machineId: shell.machineId,
            quantityProduced: Number(shell.quantityProduced),
        });
        const { count } = await tx.productionExecution.updateMany({
            where: { id: shell.id, endTime: null, status: { not: 'VOIDED' } },
            data: {
                endTime,
                notes: [shell.notes, AUTO_CLOSE_NOTE].filter(Boolean).join(' '),
                ...pieceSnapshot,
            },
        });
        if (count === 1) result.closed.push({ id: shell.id, endTime });
    }
    return result;
}
