import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MovementType, Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ConflictError, ValidationError } from '@/lib/errors/errors';

export const LEDGER_ROUNDING_ALIGN_ACTION = 'ALIGN_STOCK_LEDGER_ROUNDING';
export const LEDGER_ROUNDING_ALIGN_REFERENCE = 'LEDGER-ROUNDING-ALIGN';

const MATERIAL_DIFF_THRESHOLD = new Prisma.Decimal('0.01');
const TRANSACTION_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 10_000;

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

export type LedgerAlignmentRequest = z.infer<typeof requestSchema>;

export function parseLedgerAlignmentRequest(
    value: unknown,
    execute: boolean,
): LedgerAlignmentRequest {
    const input = requestSchema.parse(value);
    if (execute && !input.fingerprint)
        throw new ValidationError('Reviewed fingerprint required.');
    return input;
}

export interface LedgerAlignmentItem {
    productVariantId: string;
    skuCode: string;
    locationId: string;
    locationName: string;
    live: string;
    ledger: string;
    diff: string;
}

export interface LedgerAlignmentPreview {
    candidates: LedgerAlignmentItem[];
    unhandledMaterial: LedgerAlignmentItem[];
    fingerprint: string;
}

type RawLedgerMismatchRow = {
    productVariantId: string;
    skuCode: string;
    locationId: string;
    locationName: string;
    live: Prisma.Decimal | string | number;
    ledger: Prisma.Decimal | string | number;
    diff?: Prisma.Decimal | string | number;
    averageCost?: Prisma.Decimal | string | number | null;
};

type LockedInventoryRow = {
    id: string;
    productVariantId: string;
    locationId: string;
    quantity: Prisma.Decimal | string | number;
    averageCost: Prisma.Decimal | string | number | null;
};

function compareAlignmentItems(a: LedgerAlignmentItem, b: LedgerAlignmentItem): number {
    return (
        a.skuCode.localeCompare(b.skuCode) ||
        a.locationName.localeCompare(b.locationName) ||
        a.productVariantId.localeCompare(b.productVariantId) ||
        a.locationId.localeCompare(b.locationId)
    );
}

function computeFingerprint(candidates: LedgerAlignmentItem[]): string {
    return createHash('sha256')
        .update(JSON.stringify({ version: 1, candidates }))
        .digest('hex');
}

async function queryMismatchRows(tx: Prisma.TransactionClient): Promise<RawLedgerMismatchRow[]> {
    return tx.$queryRaw<RawLedgerMismatchRow[]>(Prisma.sql`
        WITH ledger AS (
            SELECT
                "productVariantId",
                "locationId",
                COALESCE(SUM("inQuantity") - SUM("outQuantity"), 0) AS "ledgerQuantity"
            FROM (
                SELECT
                    "productVariantId",
                    "toLocationId" AS "locationId",
                    "quantity" AS "inQuantity",
                    0::numeric AS "outQuantity"
                FROM "StockMovement"
                WHERE "toLocationId" IS NOT NULL
                UNION ALL
                SELECT
                    "productVariantId",
                    "fromLocationId" AS "locationId",
                    0::numeric AS "inQuantity",
                    "quantity" AS "outQuantity"
                FROM "StockMovement"
                WHERE "fromLocationId" IS NOT NULL
            ) m
            GROUP BY "productVariantId", "locationId"
        )
        SELECT
            pv."id" AS "productVariantId",
            pv."skuCode" AS "skuCode",
            loc."id" AS "locationId",
            loc."name" AS "locationName",
            COALESCE(inv."quantity", 0)::text AS "live",
            COALESCE(l."ledgerQuantity", 0)::text AS "ledger",
            (COALESCE(inv."quantity", 0) - COALESCE(l."ledgerQuantity", 0))::text AS "diff",
            inv."averageCost"::text AS "averageCost"
        FROM "Inventory" inv
        FULL JOIN ledger l
          ON l."productVariantId" = inv."productVariantId"
         AND l."locationId" = inv."locationId"
        JOIN "ProductVariant" pv
          ON pv."id" = COALESCE(inv."productVariantId", l."productVariantId")
        JOIN "Location" loc
          ON loc."id" = COALESCE(inv."locationId", l."locationId")
        WHERE COALESCE(inv."quantity", 0) <> COALESCE(l."ledgerQuantity", 0)
        ORDER BY pv."skuCode" ASC, loc."name" ASC, pv."id" ASC, loc."id" ASC
    `);
}

async function inspectMismatches(tx: Prisma.TransactionClient) {
    const rows = await queryMismatchRows(tx);
    const candidates: LedgerAlignmentItem[] = [];
    const unhandledMaterial: LedgerAlignmentItem[] = [];
    const costByPair = new Map<string, string | null>();

    for (const row of rows) {
        const live = new Prisma.Decimal(row.live ?? 0);
        const ledger = new Prisma.Decimal(row.ledger ?? 0);
        const diff = row.diff !== undefined ? new Prisma.Decimal(row.diff) : live.minus(ledger);
        if (diff.isZero()) continue;

        const item: LedgerAlignmentItem = {
            productVariantId: row.productVariantId,
            skuCode: row.skuCode,
            locationId: row.locationId,
            locationName: row.locationName,
            live: live.toString(),
            ledger: ledger.toString(),
            diff: diff.toString(),
        };
        costByPair.set(
            `${row.productVariantId}:${row.locationId}`,
            row.averageCost !== null && row.averageCost !== undefined
                ? new Prisma.Decimal(row.averageCost).toString()
                : null,
        );

        if (diff.abs().lt(MATERIAL_DIFF_THRESHOLD)) {
            candidates.push(item);
        } else {
            unhandledMaterial.push(item);
        }
    }

    candidates.sort(compareAlignmentItems);
    unhandledMaterial.sort(compareAlignmentItems);
    return {
        preview: {
            candidates,
            unhandledMaterial,
            fingerprint: computeFingerprint(candidates),
        } satisfies LedgerAlignmentPreview,
        costByPair,
    };
}

/**
 * Read-only inspection of stock ledger mismatches. Only residuals with
 * 0 < |diff| < 0.01 are eligible candidates; >= 0.01 are reported separately.
 */
export async function previewLedgerAlignment(
    db: PrismaClient,
): Promise<LedgerAlignmentPreview> {
    return db.$transaction(
        async (tx) => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            const { preview } = await inspectMismatches(tx);
            return preview;
        },
        {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            timeout: TRANSACTION_TIMEOUT_MS,
            maxWait: TRANSACTION_MAX_WAIT_MS,
        },
    );
}

/** Durable host-mounted backup with exclusive create, fsync, and SHA-256 readback. */
export async function saveLedgerAlignmentBackup(
    root: string,
    tenantId: string,
    evidence: unknown,
    fingerprint: string,
): Promise<string> {
    const folder = join(root, 'stock-ledger-alignment');
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const file = join(folder, `${randomUUID()}.json`);
    const body = JSON.stringify({ version: 1, tenantId, fingerprint, evidence });
    await writeFile(file, body, { encoding: 'utf8', mode: 0o600, flag: 'wx', flush: true });
    const digest = createHash('sha256').update(body).digest('hex');
    if (createHash('sha256').update(await readFile(file)).digest('hex') !== digest)
        throw new Error('Backup verification failed.');
    return `${file}#sha256=${digest}`;
}

export async function applyLedgerAlignment(
    db: PrismaClient,
    rawInput: LedgerAlignmentRequest,
    backup: (preview: LedgerAlignmentPreview, fingerprint: string) => Promise<string>,
) {
    const input = parseLedgerAlignmentRequest(rawInput, true);
    return db.$transaction(
        async (tx) => {
            const actor = await tx.user.findUnique({
                where: { id: input.actorId },
                select: { id: true },
            });
            if (!actor) throw new ValidationError('Actor user does not exist.');

            const initial = await inspectMismatches(tx);
            if (initial.preview.fingerprint !== input.fingerprint) {
                throw new ConflictError(
                    'Fingerprint tidak cocok dengan kondisi kartu stok saat ini; jalankan ulang preview.',
                );
            }
            if (initial.preview.candidates.length === 0) {
                return {
                    alreadyClean: true,
                    message: 'Kartu stok sudah bersih; tidak ada residu pembulatan.',
                    fingerprint: initial.preview.fingerprint,
                    candidates: [] as LedgerAlignmentItem[],
                    unhandledMaterial: initial.preview.unhandledMaterial,
                    movementIds: [] as string[],
                    backupReference: null as string | null,
                    auditId: null as string | null,
                };
            }

            const lockedRows = await tx.$queryRaw<LockedInventoryRow[]>(Prisma.sql`
                SELECT
                    "id",
                    "productVariantId",
                    "locationId",
                    "quantity"::text AS "quantity",
                    "averageCost"::text AS "averageCost"
                FROM "Inventory"
                WHERE (${Prisma.join(
                    initial.preview.candidates.map(
                        (c) =>
                            Prisma.sql`("productVariantId" = ${c.productVariantId} AND "locationId" = ${c.locationId})`,
                    ),
                    ' OR ',
                )})
                ORDER BY "productVariantId" ASC, "locationId" ASC
                FOR UPDATE
            `);
            const lockedCostByPair = new Map<string, string | null>();
            for (const locked of lockedRows) {
                lockedCostByPair.set(
                    `${locked.productVariantId}:${locked.locationId}`,
                    locked.averageCost !== null && locked.averageCost !== undefined
                        ? new Prisma.Decimal(locked.averageCost).toString()
                        : null,
                );
            }

            const verified = await inspectMismatches(tx);
            if (verified.preview.fingerprint !== input.fingerprint) {
                throw new ConflictError(
                    'Fingerprint berubah setelah lock baris Inventory; jalankan ulang preview.',
                );
            }

            const backupReference = await backup(verified.preview, verified.preview.fingerprint);
            const movementIds: string[] = [];
            const appliedPairs = [];

            for (const candidate of verified.preview.candidates) {
                const diff = new Prisma.Decimal(candidate.diff);
                const quantity = diff.abs();
                const isInbound = diff.gt(0);
                const pairKey = `${candidate.productVariantId}:${candidate.locationId}`;
                const rawCost = lockedCostByPair.has(pairKey)
                    ? lockedCostByPair.get(pairKey)
                    : verified.costByPair.get(pairKey);
                const cost =
                    rawCost !== null && rawCost !== undefined ? new Prisma.Decimal(rawCost) : null;

                const created = await tx.stockMovement.create({
                    data: {
                        type: MovementType.ADJUSTMENT,
                        productVariantId: candidate.productVariantId,
                        fromLocationId: isInbound ? null : candidate.locationId,
                        toLocationId: isInbound ? candidate.locationId : null,
                        quantity,
                        cost,
                        reference: LEDGER_ROUNDING_ALIGN_REFERENCE,
                        createdById: input.actorId,
                    },
                });
                movementIds.push(created.id);
                appliedPairs.push({
                    productVariantId: candidate.productVariantId,
                    skuCode: candidate.skuCode,
                    locationId: candidate.locationId,
                    locationName: candidate.locationName,
                    live: candidate.live,
                    ledger: candidate.ledger,
                    diff: candidate.diff,
                    movementId: created.id,
                    direction: isInbound ? ('IN' as const) : ('OUT' as const),
                    quantity: quantity.toString(),
                    cost: cost?.toString() ?? null,
                });
            }

            const postCheck = await inspectMismatches(tx);
            const targetKeys = new Set(
                verified.preview.candidates.map((c) => `${c.productVariantId}:${c.locationId}`),
            );
            const remainingMismatch = [
                ...postCheck.preview.candidates,
                ...postCheck.preview.unhandledMaterial,
            ].find((item) => targetKeys.has(`${item.productVariantId}:${item.locationId}`));
            if (remainingMismatch || postCheck.preview.candidates.length > 0) {
                throw new ConflictError(
                    'Postcondition gagal: masih ada selisih kartu stok setelah penyelarasan.',
                );
            }

            const audit = await tx.auditLog.create({
                data: {
                    userId: input.actorId,
                    action: LEDGER_ROUNDING_ALIGN_ACTION,
                    entityType: 'StockMovement',
                    entityId: verified.preview.fingerprint,
                    dedupeKey: `${LEDGER_ROUNDING_ALIGN_ACTION}:${verified.preview.fingerprint}`,
                    details: input.reason,
                    changes: {
                        database: input.database,
                        fingerprint: verified.preview.fingerprint,
                        backupReference,
                        reason: input.reason,
                        movementIds,
                        candidates: appliedPairs,
                    },
                },
            });

            return {
                alreadyClean: false,
                fingerprint: verified.preview.fingerprint,
                candidates: verified.preview.candidates,
                unhandledMaterial: verified.preview.unhandledMaterial,
                movementIds,
                backupReference,
                auditId: audit.id,
            };
        },
        {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: TRANSACTION_TIMEOUT_MS,
            maxWait: TRANSACTION_MAX_WAIT_MS,
        },
    );
}
