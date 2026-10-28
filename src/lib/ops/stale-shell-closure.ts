import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ConflictError, ValidationError } from '@/lib/errors/errors';
import {
    closeOpenShellsForOrder,
    frozenExecutionIds,
    resolveShellEndTime,
    type ShellClosureResult,
} from '@/services/production/order-shell-closure';

/**
 * One-off closure of kiosk shells left open on SPKs that were finished from the
 * admin page before that path closed them. Dry-run is read-only; apply needs
 * its fingerprint, writes evidence of every prior value first, then closes the
 * shells through the same helper the live "Selesai SPK" path uses.
 */

export const STALE_SHELL_ACTION = 'CLOSE_STALE_SHELLS';
const MS_PER_HOUR = 3_600_000;
const TRANSACTION_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 10_000;

const requestSchema = z
    .object({
        tenant: z.string().regex(/^[a-z0-9-]+$/),
        database: z.string().regex(/^[a-z0-9_]+$/),
        actorId: z.string().min(1).max(100),
        reason: z.string().trim().min(12).max(1000),
        atLastOutput: z.boolean(),
        zeroHourOrderNumbers: z.array(z.string().min(1).max(80)).max(50),
        fingerprint: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
    })
    .strict();

export type StaleShellRequest = z.infer<typeof requestSchema>;

export function parseStaleShellRequest(
    value: unknown,
    execute: boolean,
): StaleShellRequest {
    const input = requestSchema.parse(value);
    if (execute && !input.fingerprint)
        throw new ValidationError('Reviewed fingerprint required.');
    return input;
}

export interface PlannedShell {
    id: string;
    orderId: string;
    orderNumber: string;
    machineId: string | null;
    startTime: string;
    plannedEndTime: string;
    atLastOutput: boolean;
    previous: {
        notes: string | null;
        pieceRateSnapshot: string | null;
        pieceEarnings: string | null;
        pieceMachineType: string | null;
    };
}

export interface StaleShellPlan {
    database: string;
    fingerprint: string;
    shells: PlannedShell[];
    frozenShellIds: string[];
    unreadableOrderNumbers: string[];
    totals: {
        orders: number;
        shells: number;
        withHours: number;
        hours: number;
    };
}

const shellHours = (shell: PlannedShell) =>
    (Date.parse(shell.plannedEndTime) - Date.parse(shell.startTime)) /
    MS_PER_HOUR;

function summarize(shells: PlannedShell[]) {
    const hours = shells.reduce((sum, shell) => sum + shellHours(shell), 0);
    return {
        orders: new Set(shells.map((shell) => shell.orderId)).size,
        shells: shells.length,
        withHours: shells.filter((shell) => shellHours(shell) > 0).length,
        hours: Math.round(hours * 10) / 10,
    };
}

async function readStaleShells(tx: Prisma.TransactionClient) {
    return tx.productionExecution.findMany({
        where: {
            endTime: null,
            status: { not: 'VOIDED' },
            productionOrder: { status: 'COMPLETED' },
        },
        orderBy: [
            { productionOrderId: 'asc' },
            { startTime: 'asc' },
            { id: 'asc' },
        ],
        select: {
            id: true,
            productionOrderId: true,
            machineId: true,
            startTime: true,
            notes: true,
            pieceRateSnapshot: true,
            pieceEarnings: true,
            pieceMachineType: true,
            productionOrder: { select: { orderNumber: true } },
        },
    });
}

async function assertActorAndOverrides(
    tx: Prisma.TransactionClient,
    input: StaleShellRequest,
    staleOrderNumbers: Set<string>,
) {
    const actor = await tx.user.findUnique({
        where: { id: input.actorId },
        select: { id: true },
    });
    if (!actor) throw new ValidationError('Actor user does not exist.');
    // A typo must stop the run, never silently fall back to the tenant rule.
    const unknown = input.zeroHourOrderNumbers.filter(
        (orderNumber) => !staleOrderNumbers.has(orderNumber),
    );
    if (unknown.length)
        throw new ValidationError(
            `Zero-hour SPK has no stale shell here: ${unknown.join(', ')}`,
        );
}

/** Read-only plan of every stale shell and the end the helper will write. */
export async function planStaleShellClosure(
    tx: Prisma.TransactionClient,
    input: StaleShellRequest,
): Promise<StaleShellPlan> {
    const rows = await readStaleShells(tx);
    await assertActorAndOverrides(
        tx,
        input,
        new Set(rows.map((row) => row.productionOrder.orderNumber)),
    );
    const zeroHour = new Set(input.zeroHourOrderNumbers);
    const frozenByOrder = new Map<string, Set<string> | null>();
    for (const orderId of new Set(rows.map((row) => row.productionOrderId)))
        frozenByOrder.set(orderId, await frozenExecutionIds(tx, orderId));

    const shells: PlannedShell[] = [];
    const frozenShellIds: string[] = [];
    const unreadable = new Set<string>();
    for (const row of rows) {
        const orderNumber = row.productionOrder.orderNumber;
        const frozen = frozenByOrder.get(row.productionOrderId);
        if (!frozen) {
            unreadable.add(orderNumber);
            continue;
        }
        if (frozen.has(row.id)) {
            frozenShellIds.push(row.id);
            continue;
        }
        const atLastOutput = input.atLastOutput && !zeroHour.has(orderNumber);
        const end = await resolveShellEndTime(tx, row, atLastOutput);
        shells.push({
            id: row.id,
            orderId: row.productionOrderId,
            orderNumber,
            machineId: row.machineId,
            startTime: row.startTime.toISOString(),
            plannedEndTime: end.toISOString(),
            atLastOutput,
            previous: {
                notes: row.notes,
                pieceRateSnapshot: row.pieceRateSnapshot?.toString() ?? null,
                pieceEarnings: row.pieceEarnings?.toString() ?? null,
                pieceMachineType: row.pieceMachineType,
            },
        });
    }
    const unreadableOrderNumbers = [...unreadable].sort();
    const fingerprint = createHash('sha256')
        .update(
            JSON.stringify({
                version: 1,
                database: input.database,
                atLastOutput: input.atLastOutput,
                zeroHourOrderNumbers: [...zeroHour].sort(),
                shells: [...shells].sort((a, b) => a.id.localeCompare(b.id)),
                frozenShellIds: [...frozenShellIds].sort(),
                unreadableOrderNumbers,
            }),
        )
        .digest('hex');
    return {
        database: input.database,
        fingerprint,
        shells,
        frozenShellIds,
        unreadableOrderNumbers,
        totals: summarize(shells),
    };
}

export async function previewStaleShellClosure(
    db: PrismaClient,
    input: StaleShellRequest,
) {
    return db.$transaction(
        async (tx) => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            return planStaleShellClosure(tx, input);
        },
        {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            timeout: TRANSACTION_TIMEOUT_MS,
            maxWait: TRANSACTION_MAX_WAIT_MS,
        },
    );
}

function assertClosedAsPlanned(
    result: ShellClosureResult,
    planned: PlannedShell[],
) {
    const expected = new Map(
        planned.map((shell) => [shell.id, shell.plannedEndTime]),
    );
    const matches =
        !result.costPeriodUnreadable &&
        result.skippedFrozen.length === 0 &&
        result.closed.length === expected.size &&
        result.closed.every(
            (closed) =>
                expected.get(closed.id) === closed.endTime.toISOString(),
        );
    if (!matches)
        throw new ConflictError(
            'Closed shells differ from the reviewed plan; nothing was applied.',
            { orderNumber: planned[0]?.orderNumber },
        );
}

/** Durable evidence with exclusive create + readback digest. */
export async function saveStaleShellEvidence(
    root: string,
    tenantId: string,
    plan: StaleShellPlan,
) {
    const folder = join(root, 'stale-shell-closure');
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const file = join(folder, `${randomUUID()}.json`);
    const body = JSON.stringify({ version: 1, tenantId, plan });
    await writeFile(file, body, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
        flush: true,
    });
    const digest = createHash('sha256').update(body).digest('hex');
    if (
        createHash('sha256')
            .update(await readFile(file))
            .digest('hex') !== digest
    )
        throw new Error('Evidence verification failed.');
    return `${file}#sha256=${digest}`;
}

function assertApplicable(plan: StaleShellPlan, input: StaleShellRequest) {
    if (plan.fingerprint !== input.fingerprint)
        throw new ConflictError(
            'Stale shells changed since the dry-run; review a new dry-run.',
        );
    if (plan.frozenShellIds.length || plan.unreadableOrderNumbers.length)
        throw new ConflictError(
            'Frozen shells or unreadable cost periods need manual review.',
        );
    if (!plan.shells.length)
        throw new ConflictError('No stale shell left to close.');
}

/** All-or-nothing apply of a reviewed plan; one audit row per fingerprint. */
export async function applyStaleShellClosure(
    db: PrismaClient,
    input: StaleShellRequest,
    saveEvidence: (plan: StaleShellPlan) => Promise<string>,
) {
    return db.$transaction(
        async (tx) => {
            const plan = await planStaleShellClosure(tx, input);
            assertApplicable(plan, input);
            const backupReference = await saveEvidence(plan);
            const byOrder = new Map<string, PlannedShell[]>();
            for (const shell of plan.shells)
                byOrder.set(shell.orderId, [
                    ...(byOrder.get(shell.orderId) ?? []),
                    shell,
                ]);
            for (const [orderId, planned] of byOrder) {
                const result = await closeOpenShellsForOrder(tx, orderId, {
                    atLastOutput: planned[0].atLastOutput,
                });
                assertClosedAsPlanned(result, planned);
            }
            const audit = await tx.auditLog.create({
                data: {
                    userId: input.actorId,
                    action: STALE_SHELL_ACTION,
                    entityType: 'ProductionExecution',
                    entityId: plan.fingerprint,
                    dedupeKey: `${STALE_SHELL_ACTION}:${plan.fingerprint}`,
                    details: input.reason,
                    changes: {
                        database: plan.database,
                        fingerprint: plan.fingerprint,
                        backupReference,
                        atLastOutput: input.atLastOutput,
                        zeroHourOrderNumbers: input.zeroHourOrderNumbers,
                        totals: plan.totals,
                        shells: plan.shells.map((shell) => ({
                            id: shell.id,
                            orderNumber: shell.orderNumber,
                            endTime: shell.plannedEndTime,
                        })),
                    },
                },
            });
            return {
                fingerprint: plan.fingerprint,
                totals: plan.totals,
                backupReference,
                auditId: audit.id,
            };
        },
        {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            timeout: TRANSACTION_TIMEOUT_MS,
            maxWait: TRANSACTION_MAX_WAIT_MS,
        },
    );
}
