import { createHash } from 'node:crypto';
import { Prisma, type StockMovement } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';

export const COST_PERIOD_ACTION = 'START_PRODUCTION_COST_PERIOD';
export type PeriodJournal = Prisma.JournalEntryGetPayload<{
    include: { lines: { include: { account: true } } };
}>;
export interface CostPeriodEvidence {
    version: 1;
    orderId: string;
    movementIds: string[];
    executionIds: string[];
    sourceHash: string;
    historicalBalances: Array<{ accountId: string; amount: string }>;
    executionHash: string;
    nullScrapCount: number;
    fingerprint: string;
}
export function costPeriodHash(value: unknown): string {
    const canonical = (v: unknown): unknown =>
        Array.isArray(v)
            ? v.map(canonical)
            : v && typeof v === 'object'
              ? Object.fromEntries(
                    Object.entries(v)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([k, x]) => [k, canonical(x)]),
                )
              : v;
    return createHash('sha256')
        .update(JSON.stringify(canonical(JSON.parse(JSON.stringify(value)))))
        .digest('hex');
}
export function periodFailure(reason: string): never {
    throw new BusinessRuleError(
        `Batas biaya SPK belum dapat digunakan: ${reason}.`,
        undefined,
        'PRODUCTION_COST_PERIOD_INVALID',
    );
}
/** Keep accounting identity, not mutable account labels, in the fingerprint. */
export function costPeriodSourceHash(
    movements: StockMovement[],
    journals: PeriodJournal[],
) {
    return costPeriodHash({
        movements: [...movements].sort((a, b) => a.id.localeCompare(b.id)),
        journals: [...journals]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((j) => ({
                ...j,
                lines: [...j.lines]
                    .sort((a, b) => a.id.localeCompare(b.id))
                    .map((l) => ({
                        ...l,
                        account: { id: l.accountId, type: l.account.type },
                    })),
            })),
    });
}
export async function readCostPeriod(
    tx: Prisma.TransactionClient,
    orderId: string,
): Promise<CostPeriodEvidence | null> {
    const audit = await tx.auditLog.findUnique({
        where: { dedupeKey: `${COST_PERIOD_ACTION}:${orderId}` },
        select: {
            action: true,
            entityId: true,
            entityType: true,
            changes: true,
        },
    });
    if (!audit) return null;
    const data = audit.changes as unknown as CostPeriodEvidence;
    if (
        audit.action !== COST_PERIOD_ACTION ||
        audit.entityType !== 'ProductionOrder' ||
        audit.entityId !== orderId ||
        data?.version !== 1 ||
        data.orderId !== orderId ||
        !Array.isArray(data.movementIds) ||
        !data.movementIds.length ||
        data.movementIds.length > 1000 ||
        new Set(data.movementIds).size !== data.movementIds.length ||
        !data.movementIds.every((id) => typeof id === 'string') ||
        !Array.isArray(data.executionIds) ||
        !data.executionIds.length ||
        data.executionIds.length > 500 ||
        new Set(data.executionIds).size !== data.executionIds.length ||
        !data.executionIds.every((id) => typeof id === 'string') ||
        !/^[a-f0-9]{64}$/.test(data.sourceHash) ||
        !/^[a-f0-9]{64}$/.test(data.executionHash) ||
        !/^[a-f0-9]{64}$/.test(data.fingerprint) ||
        !Array.isArray(data.historicalBalances) ||
        data.historicalBalances.some(
            (b) =>
                !b ||
                typeof b.accountId !== 'string' ||
                typeof b.amount !== 'string' ||
                !/^\d+\.\d{2}$/.test(b.amount),
        )
    )
        periodFailure('bukti persetujuan tidak valid');
    return data;
}

/** Ignore no history implicitly: verify exact frozen sources before isolating new funding. */
export async function forwardCostMovements(
    tx: Prisma.TransactionClient,
    orderId: string,
    movements: StockMovement[],
    journals: PeriodJournal[],
) {
    const period = await readCostPeriod(tx, orderId);
    if (!period) return movements;
    const ids = new Set(period.movementIds);
    const baseline = movements.filter((m) => ids.has(m.id));
    const originalJournals = journals.filter(
        (j) => j.referenceId && ids.has(j.referenceId),
    );
    if (
        baseline.length !== ids.size ||
        costPeriodSourceHash(baseline, originalJournals) !== period.sourceHash
    )
        periodFailure('sumber historis berubah; minta pemeriksaan Finance');
    const executions = await tx.productionExecution.findMany({
        where: { id: { in: period.executionIds }, productionOrderId: orderId },
        orderBy: { id: 'asc' },
    });
    if (
        executions.length !== period.executionIds.length ||
        costPeriodHash(executions) !== period.executionHash
    )
        periodFailure('hasil historis berubah setelah batas biaya');
    const current = movements.filter((m) => !ids.has(m.id));
    if (current.some((m) => m.reversalOfId && ids.has(m.reversalOfId)))
        periodFailure('hasil historis tidak boleh dibalik lewat periode baru');
    return current;
}
