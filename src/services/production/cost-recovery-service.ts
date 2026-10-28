import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { hasAnyRole } from '@/lib/auth/roles';
import {
    ApplicationError,
    AuthorizationError,
    BusinessRuleError,
    NotFoundError,
} from '@/lib/errors/errors';
import {
    ABSORBED_SCRAP_ACTION,
    AbsorbedScrapRejection,
    inspectAbsorbedScrap,
    normalizeAbsorbedScrapInTransaction,
} from '@/lib/ops/absorbed-scrap-normalization';
import { availableProductionWip } from '@/services/accounting/production-wip-provenance';
import { readCostPeriod } from '@/services/accounting/production-cost-period';
import type {
    ProductionCostRecoveryInspection,
    ProductionCostRecoveryResult,
} from '@/lib/production/cost-recovery';

type Tx = Prisma.TransactionClient;
const VERSION = 'metadata-only-v1';
const zero = () => new Prisma.Decimal(0);
function reject(message: string): never {
    throw new BusinessRuleError(
        message,
        undefined,
        'PRODUCTION_RECOVERY_BLOCKED',
    );
}
export const recoveryFingerprint = (value: unknown): string => {
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
};
export interface RecoveryBackupStore {
    ready(): boolean;
    /** Persist outside the business DB and read back/hash-verify before resolving. */
    save(snapshot: unknown, fingerprint: string): Promise<string>;
}

async function assertBoundedOrder(tx: Tx, orderId: string) {
    if (
        (await tx.stockMovement.count({
            where: { productionOrderId: orderId },
        })) > 1000 ||
        (await tx.productionExecution.count({
            where: { productionOrderId: orderId },
        })) > 500
    ) {
        reject(
            'Riwayat SPK melebihi batas pemeriksaan interaktif. Minta tim sistem meninjau sumber secara terpisah.',
        );
    }
}

async function identity(tx: Tx) {
    const [row] = await tx.$queryRaw<
        Array<{ name: string }>
    >`SELECT current_database() AS name`;
    if (!row?.name) reject('Identitas ruang kerja belum dapat dipastikan.');
    return row.name;
}

/** Deliberately conservative: no unknown opening, other receipts, usage, reset or transfer
 * anywhere for these scrap SKUs. Today's zero WAC alone proves nothing about past COGS. */
async function inspectWebCandidate(
    tx: Tx,
    orderId: string,
    orderNumber: string,
) {
    const database = await identity(tx);
    const evidence = await inspectAbsorbedScrap(
        tx,
        database,
        orderId,
        orderNumber,
    );
    const variantIds = evidence.scraps.map((m) => m.productVariantId);
    const movements = await tx.stockMovement.findMany({
        where: { productVariantId: { in: variantIds } },
        orderBy: { id: 'asc' },
        take: 1001,
    });
    const allowed = new Set(evidence.scraps.map((m) => m.id));
    if (
        movements.length !== allowed.size ||
        movements.some((m) => !allowed.has(m.id))
    ) {
        reject(
            'Affal memiliki riwayat lain. Nilai awal dan dampak pemakaian/penjualan harus ditelusuri sebelum koreksi.',
        );
    }
    const inventories = await tx.inventory.findMany({
        where: { productVariantId: { in: variantIds } },
        orderBy: { id: 'asc' },
    });
    for (const inventory of inventories) {
        const receipts = evidence.scraps.filter(
            (m) =>
                m.productVariantId === inventory.productVariantId &&
                m.toLocationId === inventory.locationId,
        );
        const quantity = receipts.reduce(
            (sum, m) => sum.plus(m.quantity),
            zero(),
        );
        if (
            !inventory.quantity.eq(quantity) ||
            !inventory.averageCost?.isZero()
        ) {
            reject(
                'Saldo awal/nilai historis affal belum terbukti nol. Koreksi otomatis tidak tersedia.',
            );
        }
    }
    const orderMovements = await tx.stockMovement.findMany({
        where: { productionOrderId: orderId },
        orderBy: { id: 'asc' },
    });
    const journals = await tx.journalEntry.findMany({
        where: { referenceId: { in: orderMovements.map((m) => m.id) } },
        orderBy: { id: 'asc' },
        include: { lines: { orderBy: { id: 'asc' } } },
    });
    const executions = await tx.productionExecution.findMany({
        where: { productionOrderId: orderId },
        orderBy: { id: 'asc' },
    });
    const snapshot = {
        version: VERSION,
        database,
        order: evidence.order,
        executions,
        movements: orderMovements,
        inventories,
        journals,
    };
    return {
        database,
        evidence,
        snapshot,
        fingerprint: recoveryFingerprint({
            snapshot,
            base: evidence.fingerprint,
        }),
    };
}

async function inspectWip(
    tx: Tx,
    orderId: string,
): Promise<ProductionCostRecoveryInspection['wip']> {
    try {
        return {
            valid: true,
            remaining: (
                await availableProductionWip(tx, orderId, { lock: false })
            ).toString(),
            reason: null,
        };
    } catch (error) {
        if (
            !(error instanceof ApplicationError) ||
            !['PRODUCTION_WIP_UNRESOLVED', 'PRODUCTION_COST_PERIOD_INVALID'].includes(error.code)
        )
            throw error;
        return {
            valid: false,
            remaining: null,
            reason: String(error.details?.reason ?? 'Sumber biaya belum valid'),
        };
    }
}

export async function inspectProductionCostRecovery(
    db: PrismaClient,
    orderId: string,
    storageReady: boolean,
): Promise<ProductionCostRecoveryInspection> {
    return db.$transaction(
        async (tx) => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            const order = await tx.productionOrder.findUnique({
                where: { id: orderId },
                include: {
                    bom: {
                        include: {
                            productVariant: { select: { primaryUnit: true } },
                        },
                    },
                },
            });
            if (!order) throw new NotFoundError('Production Order');
            await assertBoundedOrder(tx, orderId);
            const executions = await tx.productionExecution.findMany({
                where: {
                    productionOrderId: orderId,
                    status: { not: 'VOIDED' },
                },
                select: { quantityProduced: true },
            });
            const scraps = await tx.stockMovement.count({
                where: {
                    productionOrderId: orderId,
                    type: 'IN',
                    cost: null,
                    productVariant: { product: { productType: 'SCRAP' } },
                },
            });
            const previous = await tx.auditLog.findUnique({
                where: { dedupeKey: `${ABSORBED_SCRAP_ACTION}:${orderId}` },
                select: { id: true },
            });
            const wip = await inspectWip(tx, orderId);
            const result: ProductionCostRecoveryInspection = {
                orderId,
                orderNumber: order.orderNumber,
                checkedAt: new Date().toISOString(),
                status: 'needs_review',
                savedQuantity: executions
                    .reduce((sum, e) => sum.plus(e.quantityProduced), zero())
                    .toString(),
                unit: order.bom.productVariant.primaryUnit,
                outputEntries: executions.filter((e) =>
                    e.quantityProduced.gt(0),
                ).length,
                nullCostScraps: scraps,
                wip,
                findings: [],
                previousAuditId: previous?.id ?? null,
                proposal: null,
            };
            const period = await readCostPeriod(tx, orderId);
            if (period) {
                result.status = 'already_applied';
                result.findings.push(`Periode biaya baru aktif. Biaya historis Rp${period.historicalBalances.reduce((s,b)=>s.plus(b.amount),zero()).toFixed(2)} tetap dipertahankan, tidak membiayai hasil baru. Ini bukan koreksi atau pelunasan biaya lama.`);
            } else if (previous) {
                result.status = 'already_applied';
                result.findings.push(
                    'Ada koreksi terdahulu. Pemeriksaan saat ini tidak membuktikan seluruh riwayat biaya sudah direkonsiliasi.',
                );
            } else if (!scraps && wip.valid) {
                result.status = 'no_repair';
                result.findings.push(
                    'Tidak ditemukan kandidat normalisasi affal. Ini bukan jaminan seluruh biaya historis atau input hasil baru sudah benar.',
                );
            } else if (result.outputEntries > 1) {
                result.status = 'unsupported';
                result.findings.push(
                    'SPK memiliki beberapa hasil. Biaya tiap hasil dan dampak ke persediaan/HPP lanjutan perlu direkonstruksi; koreksi otomatis belum tersedia. Jangan membebankan selisih lama ke hasil berikutnya.',
                );
            } else {
                try {
                    const candidate = await inspectWebCandidate(
                        tx,
                        orderId,
                        order.orderNumber,
                    );
                    result.status = 'eligible';
                    result.proposal = {
                        fingerprint: candidate.fingerprint,
                        absorbedValue:
                            candidate.evidence.absorbedValue.toString(),
                        scraps: candidate.evidence.scraps.map((m) => ({
                            movementId: m.id,
                            quantity: m.quantity.toString(),
                        })),
                        recoveryStorageReady: storageReady,
                    };
                    result.findings.push(
                        'Biaya bahan telah terserap penuh per akun. Usulan hanya mencatat biaya affal kosong menjadi Rp0 dan menautkannya ke hasil asal. Jumlah, nilai persediaan, dan jurnal tidak berubah.',
                    );
                    if (!storageReady)
                        result.findings.push(
                            'Penyimpanan cadangan pemulihan belum tersedia. Penerapan tetap diblokir.',
                        );
                } catch (error) {
                    if (
                        !(error instanceof AbsorbedScrapRejection) &&
                        !(error instanceof BusinessRuleError)
                    )
                        throw error;
                    result.findings.push(error.message);
                }
            }
            if (!wip.valid)
                result.findings.push(
                    `Penghambat biaya saat ini: ${wip.reason}.`,
                );
            if (wip.valid && new Prisma.Decimal(wip.remaining!).gt(0))
                result.findings.push(
                    'Masih ada biaya dalam proses. Nilai ini bukan nominal jurnal koreksi yang boleh langsung diterapkan.',
                );
            return result;
        },
        {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            timeout: 30000,
        },
    );
}

export async function applyProductionCostRecovery(
    db: PrismaClient,
    input: {
        orderId: string;
        fingerprint: string;
        reason: string;
        actorId: string;
    },
    backup: RecoveryBackupStore,
): Promise<ProductionCostRecoveryResult> {
    if (
        !/^[a-f0-9]{64}$/.test(input.fingerprint) ||
        input.reason.trim().length < 12 ||
        input.reason.length > 1000
    )
        reject('Preview dan alasan koreksi yang lengkap wajib diisi.');
    return db.$transaction(
        async (tx) => {
            const actor = await tx.user.findUnique({
                where: { id: input.actorId },
                select: {
                    isActive: true,
                    role: true,
                    roles: { select: { role: true } },
                },
            });
            if (
                !actor?.isActive ||
                !hasAnyRole(
                    { role: actor.role, roles: actor.roles.map((r) => r.role) },
                    ['ADMIN', 'FINANCE'],
                )
            )
                throw new AuthorizationError('Aktor koreksi tidak diizinkan.');
            await tx.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id = ${input.orderId} FOR UPDATE`;
            const previous = await tx.auditLog.findUnique({
                where: {
                    dedupeKey: `${ABSORBED_SCRAP_ACTION}:${input.orderId}`,
                },
            });
            if (previous) {
                const saved = previous.changes as Prisma.JsonObject | null;
                if (
                    saved?.webFingerprint !== input.fingerprint ||
                    saved?.webVersion !== VERSION
                )
                    reject(
                        'Koreksi lain sudah tercatat. Periksa ulang riwayat SPK.',
                    );
                return { auditId: previous.id, alreadyApplied: true };
            }
            const order = await tx.productionOrder.findUnique({
                where: { id: input.orderId },
            });
            if (!order) throw new NotFoundError('Production Order');
            await assertBoundedOrder(tx, order.id);
            // Lock sources and scrap pools as well as the WO; Serializable predicate reads
            // reject concurrent new history. Never retry automatically with a different preview.
            await tx.$queryRaw`SELECT id FROM "ProductionExecution" WHERE "productionOrderId" = ${order.id} ORDER BY id FOR UPDATE`;
            await tx.$queryRaw`SELECT id FROM "StockMovement" WHERE "productionOrderId" = ${order.id} ORDER BY id FOR UPDATE`;
            await tx.$queryRaw`SELECT j.id FROM "JournalEntry" j JOIN "StockMovement" m ON m.id = j."referenceId" WHERE m."productionOrderId" = ${order.id} ORDER BY j.id FOR UPDATE OF j`;
            await tx.$queryRaw`SELECT l.id FROM "JournalLine" l JOIN "JournalEntry" j ON j.id=l."journalEntryId" JOIN "StockMovement" m ON m.id=j."referenceId" WHERE m."productionOrderId"=${order.id} ORDER BY l.id FOR UPDATE OF l`;
            await tx.$queryRaw`SELECT i.id FROM "Inventory" i WHERE i."productVariantId" IN (SELECT m."productVariantId" FROM "StockMovement" m JOIN "ProductVariant" v ON v.id=m."productVariantId" JOIN "Product" p ON p.id=v."productId" WHERE m."productionOrderId"=${order.id} AND p."productType"='SCRAP') ORDER BY i.id FOR UPDATE`;
            if (await readCostPeriod(tx, order.id)) reject('Nilai historis sudah dipertahankan oleh batas biaya. Koreksi lama tidak diizinkan melalui mode ini.');
            const candidate = await inspectWebCandidate(
                tx,
                order.id,
                order.orderNumber,
            );
            if (candidate.fingerprint !== input.fingerprint)
                reject(
                    'Data berubah setelah preview. Periksa ulang; tidak ada koreksi diterapkan.',
                );
            if (!backup.ready())
                reject(
                    'Cadangan pemulihan belum tersedia. Tidak ada koreksi diterapkan.',
                );
            // Back up only fields this operation may change, plus verification anchors;
            // no execution notes, photos, personnel details or journal descriptions.
            const backupReference = await backup.save(
                {
                    version: VERSION,
                    database: candidate.database,
                    orderId: order.id,
                    movements: candidate.evidence.scraps.map((m) => ({
                        id: m.id,
                        cost: m.cost,
                        companyOwned: m.companyOwned,
                        productionExecutionId: m.productionExecutionId,
                    })),
                    beforeStateHash: recoveryFingerprint(candidate.snapshot),
                },
                candidate.fingerprint,
            );
            if (!backupReference)
                reject('Verifikasi cadangan pemulihan gagal.');
            const result = await normalizeAbsorbedScrapInTransaction(
                tx,
                {
                    database: candidate.database,
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    actorId: input.actorId,
                    reason: input.reason.trim(),
                    expectedFingerprint: candidate.evidence.fingerprint,
                    backupReference,
                },
                true,
            );
            if (!('auditId' in result))
                reject('Bukti audit koreksi tidak tersedia.');
            const afterMovements = await tx.stockMovement.findMany({
                where: { productionOrderId: order.id },
                orderBy: { id: 'asc' },
            });
            const expected = candidate.snapshot.movements.map((m) =>
                candidate.evidence.scrapOwner.has(m.id)
                    ? {
                          ...m,
                          cost: new Prisma.Decimal(0),
                          companyOwned: true,
                          productionExecutionId:
                              candidate.evidence.scrapOwner.get(m.id),
                      }
                    : m,
            );
            const afterInventories = await tx.inventory.findMany({
                where: {
                    productVariantId: {
                        in: candidate.evidence.scraps.map(
                            (m) => m.productVariantId,
                        ),
                    },
                },
                orderBy: { id: 'asc' },
            });
            const afterJournals = await tx.journalEntry.findMany({
                where: { referenceId: { in: afterMovements.map((m) => m.id) } },
                orderBy: { id: 'asc' },
                include: { lines: { orderBy: { id: 'asc' } } },
            });
            if (
                recoveryFingerprint(afterMovements) !==
                    recoveryFingerprint(expected) ||
                recoveryFingerprint(afterInventories) !==
                    recoveryFingerprint(candidate.snapshot.inventories) ||
                recoveryFingerprint(afterJournals) !==
                    recoveryFingerprint(candidate.snapshot.journals) ||
                recoveryFingerprint(
                    await tx.productionExecution.findMany({
                        where: { productionOrderId: order.id },
                        orderBy: { id: 'asc' },
                    }),
                ) !== recoveryFingerprint(candidate.snapshot.executions) ||
                recoveryFingerprint(
                    await tx.productionOrder.findUnique({
                        where: { id: order.id },
                    }),
                ) !== recoveryFingerprint(order) ||
                !(
                    await availableProductionWip(tx, order.id, { lock: false })
                ).isZero()
            )
                reject(
                    'Verifikasi koreksi gagal; seluruh perubahan dibatalkan.',
                );
            const audit = await tx.auditLog.findUniqueOrThrow({
                where: { id: result.auditId },
            });
            await tx.auditLog.update({
                where: { id: audit.id },
                data: {
                    changes: {
                        ...(audit.changes as Prisma.JsonObject),
                        webVersion: VERSION,
                        webFingerprint: input.fingerprint,
                        postconditionsVerified: true,
                    },
                },
            });
            return { auditId: result.auditId, alreadyApplied: false };
        },
        {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 30000,
        },
    );
}
