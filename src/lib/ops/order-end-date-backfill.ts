import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ConflictError, ValidationError } from '@/lib/errors/errors';
import { completionEndDate } from '@/services/production/order-end-date';

/**
 * One-off fill of `actualEndDate` on COMPLETED SPKs finished before
 * completion recorded it. Same rule as the live path (last output, else the
 * fallback); the fallback is `updatedAt`, which is where cost reports place
 * these SPKs today. Written with raw SQL so `updatedAt` itself is untouched.
 */

export const END_DATE_BACKFILL_ACTION = 'BACKFILL_ORDER_END_DATES';
// ~1.3k aggregates plus as many single-row updates in one transaction.
const TRANSACTION_TIMEOUT_MS = 300_000;
const TRANSACTION_MAX_WAIT_MS = 10_000;
const WIB_OFFSET_MS = 7 * 3_600_000;

const requestSchema = z
    .object({
        tenant: z.string().regex(/^[a-z0-9-]+$/),
        database: z.string().regex(/^[a-z0-9_]+$/),
        actorId: z.string().min(1).max(100),
        reason: z.string().trim().min(12).max(1000),
        fingerprint: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
    })
    .strict();

export type EndDateBackfillRequest = z.infer<typeof requestSchema>;

export function parseEndDateBackfillRequest(
    value: unknown,
    execute: boolean,
): EndDateBackfillRequest {
    const input = requestSchema.parse(value);
    if (execute && !input.fingerprint)
        throw new ValidationError('Reviewed fingerprint required.');
    return input;
}

export interface PlannedEndDate {
    id: string;
    orderNumber: string;
    updatedAt: string;
    actualEndDate: string;
    source: 'OUTPUT' | 'FALLBACK';
}

export interface EndDatePlan {
    database: string;
    fingerprint: string;
    orders: PlannedEndDate[];
    months: Array<{ month: string; orders: number; fallback: number }>;
    /** SPKs whose cost-report month changes from `updatedAt` to the end date. */
    monthMoves: Array<{ orderNumber: string; from: string; to: string }>;
}

const wibMonth = (iso: string) =>
    new Date(Date.parse(iso) + WIB_OFFSET_MS).toISOString().slice(0, 7);

function summarizeMonths(orders: PlannedEndDate[]) {
    const months = new Map<string, { orders: number; fallback: number }>();
    for (const order of orders) {
        const month = wibMonth(order.actualEndDate);
        const current = months.get(month) ?? { orders: 0, fallback: 0 };
        months.set(month, {
            orders: current.orders + 1,
            fallback: current.fallback + (order.source === 'FALLBACK' ? 1 : 0),
        });
    }
    return [...months.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, counts]) => ({ month, ...counts }));
}

/** Read-only plan of every COMPLETED SPK without an end date. */
export async function planOrderEndDates(
    tx: Prisma.TransactionClient,
    input: EndDateBackfillRequest,
): Promise<EndDatePlan> {
    const actor = await tx.user.findUnique({
        where: { id: input.actorId },
        select: { id: true },
    });
    if (!actor) throw new ValidationError('Actor user does not exist.');
    const rows = await tx.productionOrder.findMany({
        where: { status: 'COMPLETED', actualEndDate: null },
        select: { id: true, orderNumber: true, updatedAt: true },
        orderBy: { id: 'asc' },
    });
    const orders: PlannedEndDate[] = [];
    for (const row of rows) {
        const end = await completionEndDate(tx, row.id, row.updatedAt);
        orders.push({
            id: row.id,
            orderNumber: row.orderNumber,
            updatedAt: row.updatedAt.toISOString(),
            actualEndDate: end.toISOString(),
            // completionEndDate hands back the fallback object itself when no output exists.
            source: end === row.updatedAt ? 'FALLBACK' : 'OUTPUT',
        });
    }
    const fingerprint = createHash('sha256')
        .update(
            JSON.stringify({ version: 1, database: input.database, orders }),
        )
        .digest('hex');
    return {
        database: input.database,
        fingerprint,
        orders,
        months: summarizeMonths(orders),
        monthMoves: orders
            .filter(
                (order) =>
                    wibMonth(order.actualEndDate) !== wibMonth(order.updatedAt),
            )
            .map((order) => ({
                orderNumber: order.orderNumber,
                from: wibMonth(order.updatedAt),
                to: wibMonth(order.actualEndDate),
            })),
    };
}

const transactionOptions = {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    timeout: TRANSACTION_TIMEOUT_MS,
    maxWait: TRANSACTION_MAX_WAIT_MS,
};

export async function previewOrderEndDates(
    db: PrismaClient,
    input: EndDateBackfillRequest,
) {
    return db.$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return planOrderEndDates(tx, input);
    }, transactionOptions);
}

/** Durable evidence with exclusive create + readback digest. */
export async function saveEndDateEvidence(
    root: string,
    tenantId: string,
    plan: EndDatePlan,
) {
    const folder = join(root, 'order-end-date-backfill');
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

/** All-or-nothing apply of a reviewed plan; one audit row per fingerprint. */
export async function applyOrderEndDates(
    db: PrismaClient,
    input: EndDateBackfillRequest,
    saveEvidence: (plan: EndDatePlan) => Promise<string>,
) {
    return db.$transaction(async (tx) => {
        const plan = await planOrderEndDates(tx, input);
        if (plan.fingerprint !== input.fingerprint)
            throw new ConflictError(
                'SPK end dates changed since the dry-run; review a new dry-run.',
            );
        if (!plan.orders.length)
            throw new ConflictError('No COMPLETED SPK is missing an end date.');
        const backupReference = await saveEvidence(plan);
        for (const order of plan.orders) {
            // Raw SQL on purpose: a Prisma update would also move @updatedAt.
            const count = await tx.$executeRaw`
                UPDATE "ProductionOrder"
                SET "actualEndDate" = CAST(${order.actualEndDate} AS timestamptz) AT TIME ZONE 'UTC'
                WHERE id = ${order.id} AND status = 'COMPLETED' AND "actualEndDate" IS NULL`;
            if (count !== 1)
                throw new ConflictError(
                    'An SPK changed during the backfill; nothing was applied.',
                    { orderNumber: order.orderNumber },
                );
        }
        const audit = await tx.auditLog.create({
            data: {
                userId: input.actorId,
                action: END_DATE_BACKFILL_ACTION,
                entityType: 'ProductionOrder',
                entityId: plan.fingerprint,
                dedupeKey: `${END_DATE_BACKFILL_ACTION}:${plan.fingerprint}`,
                details: input.reason,
                changes: {
                    database: plan.database,
                    fingerprint: plan.fingerprint,
                    backupReference,
                    months: plan.months,
                    monthMoves: plan.monthMoves,
                    orders: plan.orders.map((order) => ({
                        id: order.id,
                        orderNumber: order.orderNumber,
                        actualEndDate: order.actualEndDate,
                        source: order.source,
                    })),
                },
            },
        });
        return {
            fingerprint: plan.fingerprint,
            orders: plan.orders.length,
            fallback: plan.orders.filter((order) => order.source === 'FALLBACK')
                .length,
            monthMoves: plan.monthMoves.length,
            backupReference,
            auditId: audit.id,
        };
    }, transactionOptions);
}
