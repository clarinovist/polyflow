import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { skuInventoryBasis } from '../../services/inventory/internal-usage-accounting';

/**
 * One-off, audited restatement of an operational (ATK) stock adjustment that
 * was posted above the SKU's own inventory basis. The daily cost-health check
 * compares the subledger stock value with posted SKU-linked journals; when an
 * adjustment used a different opening value than the later per-SKU attribution,
 * the gap stays forever and re-alerts every day.
 *
 * This tool posts a delta journal in the SAME accounts as the source adjustment
 * (debit the inventory account the source credited, credit the expense account
 * the source debited), linked to the same movement so `skuInventoryBasis`
 * counts it. It never changes quantity, average cost or historical movements.
 *
 * Dry-run is read-only. Apply requires the exact fingerprint, a verified backup
 * reference, an active FINANCE/ADMIN actor and an open fiscal period.
 */
export const OPERATIONAL_BASIS_CORRECTION_ACTION = 'CORRECT_OPERATIONAL_BASIS';
const CORRECTION_REFERENCE = 'ATK-BASIS-CORR';
const VALUE_TOLERANCE = new Prisma.Decimal('1');

export interface OperationalBasisCorrectionRequest {
    database: string;
    skuCode: string;
    movementId: string;
    amount: Prisma.Decimal.Value;
    /** Business date, YYYY-MM-DD (WIB). */
    postingDate: string;
    actorId: string;
    reason: string;
    expectedFingerprint?: string;
    backupReference?: string;
}

export interface OperationalBasisCorrectionResult {
    changed: boolean;
    alreadyApplied: boolean;
    fingerprint: string;
    database: string;
    skuCode: string;
    variantId: string;
    movementId: string;
    reference: string;
    postingDate: string;
    periodId: string | null;
    stockValue: string;
    basis: string;
    gap: string;
    amount: string;
    debitAccount: { id: string; code: string; name: string };
    creditAccount: { id: string; code: string; name: string };
    sourceJournalId: string;
    sourceJournalNumber: string;
    existingJournalId?: string;
    existingJournalStatus?: string;
    journalId?: string;
    auditId?: string;
}

type Tx = Prisma.TransactionClient;
type AccountLike = {
    id: string;
    code: string;
    name: string;
    type: string;
    category: string | null;
    currency: string;
    isActive: boolean;
    isCashAccount: boolean;
};

const dec = (value: Prisma.Decimal.Value | null | undefined) =>
    new Prisma.Decimal(value ?? 0);
const hash = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(message: string): never {
    throw new Error(message);
}

const isInventoryAccount = (account: AccountLike) =>
    account.isActive &&
    account.type === 'ASSET' &&
    account.category === 'CURRENT_ASSET' &&
    account.currency === 'IDR' &&
    !account.isCashAccount;

async function assertTarget(tx: Tx, database: string) {
    const [identity] = await tx.$queryRaw<Array<{ name: string }>>`
        SELECT current_database() AS name`;
    if (identity?.name !== database)
        fail('Database bukan target yang disetujui.');
}

function parsePostingDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        fail('Tanggal posting harus berformat YYYY-MM-DD.');
    // Noon WIB keeps the business date stable in both UTC and WIB storage.
    const date = new Date(`${value}T12:00:00+07:00`);
    if (Number.isNaN(date.getTime())) fail('Tanggal posting tidak valid.');
    return date;
}

function assertRequest(
    input: OperationalBasisCorrectionRequest,
    execute: boolean,
) {
    if (
        !input.database ||
        !input.skuCode ||
        !input.movementId ||
        !input.actorId
    )
        fail('Identitas koreksi wajib lengkap.');
    if (input.reason.trim().length < 12)
        fail('Alasan koreksi minimal 12 karakter.');
    const amount = dec(input.amount);
    if (!amount.gt(0) || amount.decimalPlaces() > 2)
        fail('Nominal koreksi harus positif dengan maksimal 2 desimal.');
    if (
        execute &&
        (!/^[a-f0-9]{64}$/.test(input.expectedFingerprint ?? '') ||
            !input.backupReference?.trim())
    )
        fail(
            'Eksekusi wajib fingerprint dry-run dan referensi backup terverifikasi.',
        );
    return amount;
}

export async function correctOperationalBasis(
    db: PrismaClient,
    input: OperationalBasisCorrectionRequest,
    execute = false,
): Promise<OperationalBasisCorrectionResult> {
    const amount = assertRequest(input, execute);
    const postingAt = parsePostingDate(input.postingDate);

    return db.$transaction(
        async (tx) => {
            if (!execute) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            await assertTarget(tx, input.database);

            const actor = await tx.user.findUnique({
                where: { id: input.actorId },
                select: { role: true, isActive: true },
            });
            if (!actor?.isActive || !['ADMIN', 'FINANCE'].includes(actor.role))
                fail('Aktor koreksi tidak diizinkan.');

            const variant = await tx.productVariant.findUnique({
                where: { skuCode: input.skuCode },
                include: { product: true },
            });
            if (
                !variant ||
                variant.archivedAt ||
                variant.product.productType !== 'OPERATIONAL'
            )
                fail('SKU bukan barang operasional aktif.');

            const inventories = await tx.inventory.findMany({
                where: { productVariantId: variant.id },
                include: { location: true },
            });
            const stocked = inventories.filter((row) => row.quantity.gt(0));
            if (stocked.length !== 1)
                fail('SKU harus punya tepat satu lokasi bersaldo.');
            const location = stocked[0].location;
            if (
                location.locationType !== 'INTERNAL' ||
                location.packagingOwnerCustomerId
            )
                fail('Lokasi stok bukan internal milik perusahaan.');
            const stockValue = inventories.reduce(
                (sum, row) =>
                    sum.plus(dec(row.quantity).mul(dec(row.averageCost))),
                new Prisma.Decimal(0),
            );
            if (!stockValue.gt(0))
                fail('Nilai stok SKU nol; koreksi basis tidak berlaku.');

            const movement = await tx.stockMovement.findUnique({
                where: { id: input.movementId },
            });
            if (
                !movement ||
                movement.productVariantId !== variant.id ||
                movement.type !== 'ADJUSTMENT' ||
                !movement.fromLocationId ||
                movement.toLocationId ||
                !dec(movement.quantity).gt(0)
            )
                fail('Movement sumber bukan adjustment keluar milik SKU ini.');

            const reference = `${CORRECTION_REFERENCE}:${variant.skuCode}:${movement.reference ?? movement.id}`;
            const journals = await tx.journalEntry.findMany({
                where: {
                    referenceId: movement.id,
                    referenceType: 'STOCK_ADJUSTMENT',
                },
                include: { lines: { include: { account: true } } },
                orderBy: { createdAt: 'asc' },
            });
            const existing = journals.find(
                (journal) => journal.reference === reference,
            );
            const sources = journals.filter(
                (journal) => journal.reference !== reference,
            );
            if (sources.length !== 1)
                fail(
                    'Movement harus punya tepat satu jurnal sumber STOCK_ADJUSTMENT.',
                );
            const source = sources[0];
            if (source.status !== 'POSTED' || !source.isAutoGenerated)
                fail('Jurnal sumber harus POSTED dan otomatis.');
            if (source.lines.length !== 2)
                fail('Jurnal sumber harus tepat 2 baris.');
            const inventoryLines = source.lines.filter((line) =>
                isInventoryAccount(line.account as AccountLike),
            );
            const counterLines = source.lines.filter(
                (line) => !isInventoryAccount(line.account as AccountLike),
            );
            if (inventoryLines.length !== 1 || counterLines.length !== 1)
                fail(
                    'Jurnal sumber harus memiliki satu akun persediaan dan satu akun lawan.',
                );
            const inventoryLine = inventoryLines[0];
            const counterLine = counterLines[0];
            if (!['EXPENSE', 'EQUITY'].includes(counterLine.account.type))
                fail('Akun lawan jurnal sumber harus akun beban atau ekuitas.');
            if (
                !inventoryLine.credit.gt(0) ||
                !counterLine.debit.gt(0) ||
                !inventoryLine.credit.eq(counterLine.debit)
            )
                fail('Jurnal sumber bukan adjustment keluar yang seimbang.');
            if (amount.gt(inventoryLine.credit))
                fail('Nominal koreksi melebihi nilai jurnal sumber.');

            // Serialize against usage/stock adjustments posting on the same accounts.
            // Lock before recomputing the gap so the reviewed fingerprint cannot drift.
            if (execute && !existing) {
                await tx.$queryRaw`SELECT id FROM "Account" WHERE id IN (${inventoryLine.account.id}, ${counterLine.account.id}) ORDER BY id FOR UPDATE`;
                await tx.$queryRaw`SELECT id FROM "StockMovement" WHERE id = ${movement.id} FOR UPDATE`;
                await tx.$queryRaw`SELECT id FROM "JournalEntry" WHERE id = ${source.id} FOR UPDATE`;
                const sourceAfter = await tx.journalEntry.findUnique({
                    where: { id: source.id },
                    select: { status: true, isAutoGenerated: true },
                });
                if (
                    sourceAfter?.status !== 'POSTED' ||
                    !sourceAfter.isAutoGenerated
                )
                    fail('Jurnal sumber berubah; koreksi dibatalkan.');
            }

            const basisMap = await skuInventoryBasis(tx, variant.id);
            const basis = [...basisMap.values()].reduce(
                (sum, value) => sum.plus(value),
                new Prisma.Decimal(0),
            );
            const gap = stockValue.minus(basis);

            const period = await tx.fiscalPeriod.findFirst({
                where: {
                    startDate: { lte: postingAt },
                    endDate: { gte: postingAt },
                },
            });

            const fingerprint = hash({
                version: 1,
                database: input.database,
                skuCode: variant.skuCode,
                variantId: variant.id,
                movementId: movement.id,
                reference,
                amount: amount.toFixed(2),
                postingDate: input.postingDate,
                periodId: period?.id ?? null,
                stockValue: stockValue.toFixed(4),
                basis: basis.toFixed(2),
                gap: gap.toFixed(4),
                debitAccountId: inventoryLine.account.id,
                creditAccountId: counterLine.account.id,
                sourceJournalId: source.id,
            });
            const base: OperationalBasisCorrectionResult = {
                changed: false,
                alreadyApplied: Boolean(existing),
                fingerprint,
                database: input.database,
                skuCode: variant.skuCode,
                variantId: variant.id,
                movementId: movement.id,
                reference,
                postingDate: input.postingDate,
                periodId: period?.id ?? null,
                stockValue: stockValue.toFixed(4),
                basis: basis.toFixed(2),
                gap: gap.toFixed(4),
                amount: amount.toFixed(2),
                debitAccount: {
                    id: inventoryLine.account.id,
                    code: inventoryLine.account.code,
                    name: inventoryLine.account.name,
                },
                creditAccount: {
                    id: counterLine.account.id,
                    code: counterLine.account.code,
                    name: counterLine.account.name,
                },
                sourceJournalId: source.id,
                sourceJournalNumber: source.entryNumber,
                ...(existing
                    ? {
                          existingJournalId: existing.id,
                          existingJournalStatus: existing.status,
                      }
                    : {}),
            };

            if (existing) return base;

            if (execute) {
                const reappeared = await tx.journalEntry.findFirst({
                    where: { reference },
                    select: { id: true, status: true },
                });
                if (reappeared)
                    return {
                        ...base,
                        alreadyApplied: true,
                        existingJournalId: reappeared.id,
                        existingJournalStatus: reappeared.status,
                    };
            }

            if (!gap.gt(VALUE_TOLERANCE))
                fail('Tidak ada gap basis di atas toleransi.');
            const expectedAmount = gap.toDecimalPlaces(2);
            if (!amount.eq(expectedAmount))
                fail(
                    `Nominal harus sama dengan gap ${expectedAmount.toFixed(2)}.`,
                );
            if (!period || period.status !== 'OPEN')
                fail('Periode koreksi tidak OPEN.');

            const counterSums = await tx.journalLine.aggregate({
                where: {
                    accountId: counterLine.account.id,
                    journalEntry: { status: 'POSTED' },
                },
                _sum: { debit: true, credit: true },
            });
            const counterBalance = dec(counterSums._sum.debit).minus(
                dec(counterSums._sum.credit),
            );
            if (
                counterLine.account.type === 'EXPENSE' &&
                counterBalance.lt(amount)
            )
                fail(
                    'Saldo akun lawan tidak cukup untuk dikredit; rekonsiliasi Finance diperlukan.',
                );

            if (!execute) return base;

            if (fingerprint !== input.expectedFingerprint)
                fail(
                    'Data berubah setelah dry-run; tidak ada koreksi diterapkan.',
                );

            const quantity = dec(movement.quantity);
            const sourceUnitCost = counterLine.debit.div(quantity);
            const correctedUnitCost = counterLine.debit
                .minus(amount)
                .div(quantity);
            const description = `Koreksi nilai opname ${movement.reference ?? movement.id} (${variant.skuCode}): WAC ${correctedUnitCost.toFixed(4)}/unit x ${quantity.toString()} unit, bukan ${sourceUnitCost.toFixed(4)}/unit; selisih Rp${amount.toFixed(2)}`;
            const now = new Date();
            const journal = await tx.journalEntry.create({
                data: {
                    entryNumber: `JE-ATK-CORR-${randomUUID()}`,
                    entryDate: postingAt,
                    description,
                    reference,
                    referenceType: 'STOCK_ADJUSTMENT',
                    referenceId: movement.id,
                    status: 'POSTED',
                    isAutoGenerated: true,
                    createdById: input.actorId,
                    approvedById: input.actorId,
                    approvedAt: now,
                    lines: {
                        create: [
                            {
                                accountId: inventoryLine.account.id,
                                debit: amount,
                                credit: 0,
                                currency: 'IDR',
                                exchangeRate: 1,
                                description,
                            },
                            {
                                accountId: counterLine.account.id,
                                debit: 0,
                                credit: amount,
                                currency: 'IDR',
                                exchangeRate: 1,
                                description,
                            },
                        ],
                    },
                },
                select: { id: true },
            });
            const audit = await tx.auditLog.create({
                data: {
                    userId: input.actorId,
                    action: OPERATIONAL_BASIS_CORRECTION_ACTION,
                    entityType: 'StockMovement',
                    entityId: movement.id,
                    dedupeKey: `${OPERATIONAL_BASIS_CORRECTION_ACTION}:${reference}`,
                    details: input.reason,
                    changes: JSON.parse(
                        JSON.stringify({
                            ...base,
                            changed: true,
                            alreadyApplied: false,
                            backupReference: input.backupReference,
                            journalId: journal.id,
                        }),
                    ) as Prisma.InputJsonObject,
                },
            });
            return {
                ...base,
                changed: true,
                journalId: journal.id,
                auditId: audit.id,
            };
        },
        execute
            ? {
                  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                  timeout: 30000,
              }
            : undefined,
    );
}
