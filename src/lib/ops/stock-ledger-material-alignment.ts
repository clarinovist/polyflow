import { createHash } from 'node:crypto';
import { JournalStatus, MovementType, Prisma, type PrismaClient, type ProductType } from '@prisma/client';
import { z } from 'zod';
import { tenantContext } from '@/lib/core/prisma';
import { BusinessRuleError, ConflictError, ValidationError } from '@/lib/errors/errors';
import { resolveAccountCode } from '@/services/accounting/account-mapping-policy';
import { createJournalEntry } from '@/services/accounting/journal-posting';
import { isPeriodOpen } from '@/services/accounting/periods-service';

export { saveLedgerAlignmentBackup } from './stock-ledger-rounding-alignment';

export const LEDGER_MATERIAL_ALIGN_ACTION = 'ALIGN_STOCK_LEDGER_MATERIAL';
export const LEDGER_MATERIAL_ALIGN_REFERENCE = 'LEDGER-MATERIAL-ALIGN';
const ACTOR_ID = 'system';
const MATERIAL_DIFF_THRESHOLD = new Prisma.Decimal('0.01');
const transactionOptions = { timeout: 120_000, maxWait: 10_000 };

const requestSchema = z.object({
    tenant: z.string().regex(/^[a-z0-9-]+$/),
    database: z.string().regex(/^[a-z0-9_]+$/),
    offset: z.enum(['standard', 'reduce-loss']),
    expectedPairs: z.number().int().nonnegative().safe(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

export type MaterialAlignmentRequest = z.infer<typeof requestSchema>;

export function parseMaterialAlignmentRequest(value: unknown, execute: boolean): MaterialAlignmentRequest {
    const parsed = requestSchema.safeParse(value);
    if (!parsed.success)
        throw new ValidationError('Invalid material alignment input: tenant, database, offset, expectedPairs and optional SHA-256 fingerprint required.');
    if (execute && !parsed.data.fingerprint)
        throw new ValidationError('Reviewed fingerprint required.');
    return parsed.data;
}

type Account = { id: string; code: string };
export interface MaterialAlignmentItem {
    productVariantId: string;
    skuCode: string;
    locationId: string;
    locationName: string;
    live: string;
    ledger: string;
    diff: string;
    averageCost: string;
    direction: 'IN' | 'OUT';
    quantity: string;
    amount: string;
    debitAccount: Account;
    creditAccount: Account;
}

export interface MaterialAlignmentPreview {
    offset: MaterialAlignmentRequest['offset'];
    candidates: MaterialAlignmentItem[];
    roundingCount: number;
    totalIncrease: string;
    totalDecrease: string;
    totalNet: string;
    fingerprint: string;
}

type MismatchRow = {
    productVariantId: string;
    skuCode: string;
    locationId: string;
    locationName: string;
    live: string;
    ledger: string;
    averageCost: string | null;
    productType: ProductType;
    inventoryAccountId: string | null;
};
type InventoryRow = {
    id: string;
    productVariantId: string;
    locationId: string;
    quantity: string;
    averageCost: string | null;
};

const pairKey = (pair: { productVariantId: string; locationId: string }) =>
    `${pair.productVariantId}:${pair.locationId}`;
const difference = (row: MismatchRow) => new Prisma.Decimal(row.live).minus(row.ledger);

// Same FULL JOIN and all-time in-minus-out definition as stock-ledger-health-service.
// Keep sub-cent mismatches in the result for exact postcondition verification.
async function queryMismatches(tx: Prisma.TransactionClient): Promise<MismatchRow[]> {
    return tx.$queryRaw<MismatchRow[]>(Prisma.sql`
        WITH ledger AS (
            SELECT "productVariantId", "locationId",
                COALESCE(SUM("inQuantity") - SUM("outQuantity"), 0) AS "ledgerQuantity"
            FROM (
                SELECT "productVariantId", "toLocationId" AS "locationId",
                    "quantity" AS "inQuantity", 0::numeric AS "outQuantity"
                FROM "StockMovement" WHERE "toLocationId" IS NOT NULL
                UNION ALL
                SELECT "productVariantId", "fromLocationId" AS "locationId",
                    0::numeric AS "inQuantity", "quantity" AS "outQuantity"
                FROM "StockMovement" WHERE "fromLocationId" IS NOT NULL
            ) m
            GROUP BY "productVariantId", "locationId"
        )
        SELECT pv."id" AS "productVariantId", pv."skuCode", loc."id" AS "locationId",
            loc."name" AS "locationName", COALESCE(inv."quantity", 0)::text AS "live",
            COALESCE(l."ledgerQuantity", 0)::text AS "ledger", inv."averageCost"::text AS "averageCost",
            p."productType", p."inventoryAccountId"
        FROM "Inventory" inv
        FULL JOIN ledger l ON l."productVariantId" = inv."productVariantId" AND l."locationId" = inv."locationId"
        JOIN "ProductVariant" pv ON pv."id" = COALESCE(inv."productVariantId", l."productVariantId")
        JOIN "Location" loc ON loc."id" = COALESCE(inv."locationId", l."locationId")
        JOIN "Product" p ON p."id" = pv."productId"
        WHERE COALESCE(inv."quantity", 0) <> COALESCE(l."ledgerQuantity", 0)
        ORDER BY pv."skuCode", loc."name", pv."id", loc."id"
    `);
}

async function assertDatabase(tx: Prisma.TransactionClient, database: string) {
    const [identity] = await tx.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (identity?.name !== database) throw new ValidationError('Reviewed tenant/database differs.');
}

async function accountFor(tx: Prisma.TransactionClient, idOrCode: string): Promise<Account> {
    const select = { id: true, code: true, isActive: true } as const;
    // Product overrides, like GR account mappings, may contain an ID or a COA code.
    const account = await tx.account.findUnique({ where: { id: idOrCode }, select }) ??
        await tx.account.findUnique({ where: { code: idOrCode }, select });
    if (!account?.isActive) throw new ValidationError('Reviewed journal account is missing or inactive.');
    return { id: account.id, code: account.code };
}

async function inspect(tx: Prisma.TransactionClient, input: MaterialAlignmentRequest): Promise<MaterialAlignmentPreview> {
    const rows = await queryMismatches(tx);
    const material = rows.filter(row => difference(row).abs().gte(MATERIAL_DIFF_THRESHOLD));
    if (material.length !== input.expectedPairs)
        throw new ConflictError(`Expected ${input.expectedPairs} material pairs, found ${material.length}; jalankan ulang preview dengan jumlah yang direview.`);

    const candidates: MaterialAlignmentItem[] = [];
    // The legacy resolver uses AsyncLocalStorage rather than accepting a tx.
    // Bind its reads and cache to THIS transaction, never the registry/outer client.
    await tenantContext.run(tx as PrismaClient, async () => {
        for (const row of material) {
            const diff = difference(row);
            const cost = row.averageCost === null ? null : new Prisma.Decimal(row.averageCost);
            if (!cost || !cost.isFinite() || cost.lte(0))
                throw new ValidationError(`averageCost must be positive for ${row.skuCode}@${row.locationName}; perlu basis biaya Finance.`);
            const inbound = diff.gt(0);
            const inventoryId = row.inventoryAccountId || (await resolveAccountCode(row.productType, 'inventory')).id;
            const offsetRole = inbound && input.offset === 'standard' ? 'adjustment-gain' : 'adjustment-loss';
            const inventory = await accountFor(tx, inventoryId);
            const offset = await accountFor(tx, (await resolveAccountCode(row.productType, offsetRole)).id);
            if (inventory.id === offset.id) throw new ValidationError('Inventory and adjustment accounts must differ.');
            const amount = diff.abs().mul(cost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
            // Posting helper takes numbers. Refuse values outside its exact cent range or DB precision.
            if (amount.gt('9999999999999.99') || !new Prisma.Decimal(amount.toNumber()).equals(amount))
                throw new ValidationError('Journal amount exceeds supported precision.');
            candidates.push({
                productVariantId: row.productVariantId, skuCode: row.skuCode,
                locationId: row.locationId, locationName: row.locationName,
                live: new Prisma.Decimal(row.live).toString(), ledger: new Prisma.Decimal(row.ledger).toString(),
                diff: diff.toString(), averageCost: cost.toString(), direction: inbound ? 'IN' : 'OUT',
                quantity: diff.abs().toString(), amount: amount.toFixed(2),
                debitAccount: inbound ? inventory : offset, creditAccount: inbound ? offset : inventory,
            });
        }
    });
    candidates.sort((a, b) => a.skuCode.localeCompare(b.skuCode) || a.locationName.localeCompare(b.locationName) ||
        a.productVariantId.localeCompare(b.productVariantId) || a.locationId.localeCompare(b.locationId));
    const total = (direction: 'IN' | 'OUT') => candidates.filter(c => c.direction === direction)
        .reduce((sum, c) => sum.plus(c.amount), new Prisma.Decimal(0));
    return {
        offset: input.offset, candidates,
        roundingCount: rows.filter(row => !difference(row).isZero() && difference(row).abs().lt(MATERIAL_DIFF_THRESHOLD)).length,
        totalIncrease: total('IN').toFixed(2), totalDecrease: total('OUT').toFixed(2),
        totalNet: total('IN').minus(total('OUT')).toFixed(2),
        fingerprint: createHash('sha256').update(JSON.stringify({
            version: 1, tenant: input.tenant, database: input.database, offset: input.offset, candidates,
        })).digest('hex'),
    };
}

export async function previewMaterialAlignment(db: PrismaClient, rawInput: MaterialAlignmentRequest): Promise<MaterialAlignmentPreview> {
    const input = parseMaterialAlignmentRequest(rawInput, false);
    return db.$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await assertDatabase(tx, input.database);
        return inspect(tx, input);
    }, { ...transactionOptions, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

function assertFingerprint(preview: MaterialAlignmentPreview, input: MaterialAlignmentRequest) {
    if (preview.fingerprint !== input.fingerprint)
        throw new ConflictError('Fingerprint tidak cocok dengan kondisi kartu stok saat ini; jalankan ulang preview.');
}

// Preserve the ADJUSTMENT asset-credit guard, without importing inventory movement
// side effects (WAC/master costs/operational-loss attribution) into this ledger-only repair.
async function postAlignmentJournal(tx: Prisma.TransactionClient, candidate: MaterialAlignmentItem, movementId: string, date: Date) {
    const amount = new Prisma.Decimal(candidate.amount);
    const creditAccount = await tx.account.findUnique({ where: { id: candidate.creditAccount.id }, select: { type: true } });
    if (creditAccount?.type === 'ASSET' && amount.gt(0)) {
        const balance = await tx.journalLine.aggregate({
            where: { accountId: candidate.creditAccount.id, journalEntry: { status: 'POSTED' } },
            _sum: { debit: true, credit: true },
        });
        if (new Prisma.Decimal(balance._sum.debit ?? 0).minus(balance._sum.credit ?? 0).lt(amount))
            throw new BusinessRuleError('Saldo pembukuan persediaan belum cukup; perlu pemeriksaan Finance.');
    }
    return createJournalEntry({
        entryDate: date, description: `Stock ledger material alignment (${candidate.direction})`,
        reference: LEDGER_MATERIAL_ALIGN_REFERENCE, referenceType: 'STOCK_ADJUSTMENT', referenceId: movementId,
        status: JournalStatus.POSTED, isAutoGenerated: true, createdById: ACTOR_ID,
        lines: [
            { accountId: candidate.debitAccount.id, debit: amount.toNumber(), credit: 0 },
            { accountId: candidate.creditAccount.id, debit: 0, credit: amount.toNumber() },
        ],
    }, tx);
}

export async function applyMaterialAlignment(
    db: PrismaClient,
    rawInput: MaterialAlignmentRequest,
    backup: (preview: MaterialAlignmentPreview, fingerprint: string) => Promise<string>,
) {
    const input = parseMaterialAlignmentRequest(rawInput, true);
    return db.$transaction(async tx => {
        await assertDatabase(tx, input.database);
        const initial = await inspect(tx, input);
        assertFingerprint(initial, input);
        if (!initial.candidates.length) return {
            alreadyClean: true, message: 'Kartu stok sudah bersih; tidak ada selisih material.',
            fingerprint: initial.fingerprint, candidates: initial.candidates, movementIds: [] as string[],
            journalIds: [] as string[], backupReference: null as string | null, auditId: null as string | null,
        };
        const actor = await tx.user.findUnique({ where: { id: ACTOR_ID }, select: { id: true } });
        if (!actor) throw new ValidationError('System actor user does not exist.');
        const locked = await tx.$queryRaw<InventoryRow[]>(Prisma.sql`
            SELECT "id", "productVariantId", "locationId", "quantity"::text AS "quantity", "averageCost"::text AS "averageCost"
            FROM "Inventory" WHERE (${Prisma.join(initial.candidates.map(c =>
                Prisma.sql`("productVariantId" = ${c.productVariantId} AND "locationId" = ${c.locationId})`), ' OR ')})
            ORDER BY "productVariantId", "locationId" FOR UPDATE
        `);
        if (locked.length !== initial.candidates.length)
            throw new ConflictError('Inventory rows missing; cannot lock reviewed pairs.');
        const verified = await inspect(tx, input);
        assertFingerprint(verified, input);
        const date = new Date();
        if (!await isPeriodOpen(date, tx))
            throw new BusinessRuleError('Tidak dapat membuat jurnal di periode fiskal yang belum terbuka.');
        const backupReference = await backup(verified, verified.fingerprint);
        if (!backupReference) throw new ValidationError('Verified host backup reference required.');
        const movementIds: string[] = [];
        const journalIds: string[] = [];
        // Credit inventory only after all increases, avoiding a transient negative
        // GL balance when multiple locations share the same inventory account.
        const postingOrder = [...verified.candidates].sort((a, b) => a.direction.localeCompare(b.direction));
        for (const candidate of postingOrder) {
            const inbound = candidate.direction === 'IN';
            const movement = await tx.stockMovement.create({ data: {
                type: MovementType.ADJUSTMENT, productVariantId: candidate.productVariantId,
                toLocationId: inbound ? candidate.locationId : null,
                fromLocationId: inbound ? null : candidate.locationId,
                quantity: new Prisma.Decimal(candidate.quantity), cost: new Prisma.Decimal(candidate.averageCost),
                reference: LEDGER_MATERIAL_ALIGN_REFERENCE, createdById: ACTOR_ID, createdAt: date,
            } });
            movementIds.push(movement.id);
            journalIds.push((await postAlignmentJournal(tx, candidate, movement.id, date)).id);
        }
        const after = await queryMismatches(tx);
        const targets = new Set(verified.candidates.map(pairKey));
        if (after.some(row => targets.has(pairKey(row)) || difference(row).abs().gte(MATERIAL_DIFF_THRESHOLD)))
            throw new ConflictError('Postcondition gagal: masih ada selisih kartu stok setelah penyelarasan.');
        const inventoryAfter = await tx.inventory.findMany({ where: { id: { in: locked.map(row => row.id) } } });
        if (inventoryAfter.length !== locked.length || locked.some(before => {
            const current = inventoryAfter.find(row => row.id === before.id);
            return !current || !current.quantity.equals(before.quantity) ||
                current.averageCost?.toString() !== (before.averageCost === null ? undefined : new Prisma.Decimal(before.averageCost).toString());
        })) throw new ConflictError('Postcondition gagal: Inventory berubah saat penyelarasan.');
        // Direct tx audit matches the rounding CLI and supports its unique dedupeKey.
        const audit = await tx.auditLog.create({ data: {
            userId: ACTOR_ID, action: LEDGER_MATERIAL_ALIGN_ACTION, entityType: 'StockMovement',
            entityId: verified.fingerprint, dedupeKey: `${LEDGER_MATERIAL_ALIGN_ACTION}:${verified.fingerprint}`,
            details: `Ledger-only material alignment (${input.offset})`,
            changes: { database: input.database, fingerprint: verified.fingerprint, offset: input.offset,
                backupReference, movementIds, journalIds, candidates: verified.candidates.map(candidate => ({ ...candidate })), totalNet: verified.totalNet },
        } });
        return { alreadyClean: false, fingerprint: verified.fingerprint, candidates: verified.candidates,
            movementIds, journalIds, backupReference, auditId: audit.id };
    }, { ...transactionOptions, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
