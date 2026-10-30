import { createHash } from 'node:crypto';
import { Prisma, type StockMovement } from '@prisma/client';
import { BusinessRuleError, ConflictError } from '@/lib/errors/errors';
import {
    COST_PERIOD_HASH_VERSION,
    projectCostPeriodRow,
    type CostPeriodHashVersion,
} from './cost-period-hash-projection';

export const COST_PERIOD_ACTION = 'START_PRODUCTION_COST_PERIOD';
export type PeriodJournal = Prisma.JournalEntryGetPayload<{
    include: { lines: { include: { account: true } } };
}>;
interface CostPeriodBase {
    version: 1 | 2;
    /** Absent only on original full-row receipts; never infer from current schema. */
    hashVersion?: CostPeriodHashVersion;
    orderId: string;
    movementIds: string[];
    executionIds: string[];
    sourceHash: string;
    historicalBalances: Array<{ accountId: string; amount: string }>;
    executionHash: string;
    nullScrapCount: number;
    fingerprint: string;
}
export type CostPeriodEvidence =
    | (CostPeriodBase & { version: 1 })
    | (CostPeriodBase & {
          version: 2;
          mode: 'REVIEWED_LEGACY_SEAL';
          materialIssueIds: string[];
          scrapRecordIds: string[];
          supportHash: string;
          anomalies: Array<{ category: string; count: number }>;
          nonvoidOutput: string;
          netOutput: string;
      });
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
        { reason },
        'PRODUCTION_COST_PERIOD_INVALID',
    );
}
/** Keep accounting identity, not mutable account labels, in the fingerprint. */
export function costPeriodSourceHash(
    movements: StockMovement[],
    journals: PeriodJournal[],
    hashVersion?: CostPeriodHashVersion,
) {
    return costPeriodHash({
        movements: [...movements]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((m) => projectCostPeriodRow('StockMovement', m, hashVersion)),
        journals: [...journals]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((j) => ({
                ...projectCostPeriodRow('JournalEntry', j, hashVersion),
                lines: [...j.lines]
                    .sort((a, b) => a.id.localeCompare(b.id))
                    .map((l) => ({
                        ...projectCostPeriodRow('JournalLine', l, hashVersion),
                        account: { id: l.accountId, type: l.account.type },
                    })),
            })),
    });
}
/** Preserve the DB id ordering used by the original execution/support writers. */
export function costPeriodExecutionHash(
    executions: object[],
    hashVersion?: CostPeriodHashVersion,
) {
    return costPeriodHash(executions.map((e) =>
        projectCostPeriodRow('ProductionExecution', e, hashVersion)));
}

export function costPeriodSupportHash(
    materialIssues: object[],
    scrapRecords: object[],
    hashVersion?: CostPeriodHashVersion,
) {
    return costPeriodHash({
        materialIssues: materialIssues.map((m) =>
            projectCostPeriodRow('MaterialIssue', m, hashVersion)),
        scrapRecords: scrapRecords.map((s) =>
            projectCostPeriodRow('ScrapRecord', s, hashVersion)),
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
        !data ||
        ![1, 2].includes(data.version) ||
        (data.hashVersion !== undefined && data.hashVersion !== COST_PERIOD_HASH_VERSION) ||
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
                !(data.version === 2 ? /^-?\d+\.\d{2}$/ : /^\d+\.\d{2}$/).test(
                    b.amount,
                ),
        )
    )
        periodFailure('bukti persetujuan tidak valid');
    if (data.version === 2) {
        const validIds = (ids: unknown): ids is string[] =>
            Array.isArray(ids) &&
            ids.length <= 2000 &&
            ids.every((id) => typeof id === 'string' && id.length > 0) &&
            new Set(ids).size === ids.length;
        if (
            data.mode !== 'REVIEWED_LEGACY_SEAL' ||
            !validIds(data.materialIssueIds) ||
            !validIds(data.scrapRecordIds) ||
            !/^[a-f0-9]{64}$/.test(data.supportHash) ||
            !Array.isArray(data.anomalies) ||
            data.anomalies.some(
                (a) =>
                    !a ||
                    typeof a.category !== 'string' ||
                    !Number.isSafeInteger(a.count) ||
                    a.count < 0,
            ) ||
            !/^\d+(\.\d+)?$/.test(data.netOutput) ||
            data.netOutput !== data.nonvoidOutput
        )
            periodFailure('bukti penyegelan riwayat tidak valid');
    }
    return data;
}

/** Run after the WO lock, before even zero-output or operator/shift updates. */
export async function assertMutableCostExecution(
    tx: Prisma.TransactionClient,
    execution: { id: string; productionOrderId: string; status: string },
) {
    // Operator-actionable states keep their own codes; only a broken boundary goes to Finance.
    if (execution.status === 'VOIDED')
        throw new ConflictError(
            'Sesi produksi ini sudah dibatalkan. Muat ulang halaman dan pilih sesi yang masih berjalan.',
        );
    const period = await readCostPeriod(tx, execution.productionOrderId);
    if (period?.executionIds.includes(execution.id))
        throw new BusinessRuleError(
            'Sesi historis dibekukan karena termasuk catatan sebelum batas biaya. Mulai sesi baru untuk mencatat hasil berikutnya.',
            undefined,
            'PRODUCTION_EXECUTION_FROZEN',
        );
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
        costPeriodSourceHash(baseline, originalJournals, period.hashVersion) !== period.sourceHash
    )
        periodFailure('sumber historis berubah; minta pemeriksaan Finance');
    const executions = await tx.productionExecution.findMany({
        where: { id: { in: period.executionIds }, productionOrderId: orderId },
        orderBy: { id: 'asc' },
    });
    if (
        executions.length !== period.executionIds.length ||
        costPeriodExecutionHash(executions, period.hashVersion) !== period.executionHash
    )
        periodFailure('hasil historis berubah setelah batas biaya');
    if (period.version === 2) {
        const materialIssues = await tx.materialIssue.findMany({
            where: {
                id: { in: period.materialIssueIds },
                productionOrderId: orderId,
            },
            orderBy: { id: 'asc' },
        });
        const scrapRecords = await tx.scrapRecord.findMany({
            where: {
                id: { in: period.scrapRecordIds },
                productionOrderId: orderId,
            },
            orderBy: { id: 'asc' },
        });
        if (
            materialIssues.length !== period.materialIssueIds.length ||
            scrapRecords.length !== period.scrapRecordIds.length ||
            costPeriodSupportHash(materialIssues, scrapRecords, period.hashVersion) !==
                period.supportHash
        )
            periodFailure('catatan bahan atau affal historis berubah');
    }
    const current = movements.filter((m) => !ids.has(m.id));
    if (current.some((m) => m.reversalOfId && ids.has(m.reversalOfId)))
        periodFailure('hasil historis tidak boleh dibalik lewat periode baru');
    return current;
}
