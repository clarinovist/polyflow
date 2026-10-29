import { Prisma, type PrismaClient } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { skuInventoryBasis } from './internal-usage-accounting';
import type {
    InventoryReconciliationDiagnosis,
    ReconciliationCatalog,
    ReconciliationFinding,
} from '@/types/inventory-reconciliation';

const PAGE_SIZE = 20;
const EVIDENCE_LIMIT = 100;
const LOCATION_LIMIT = 200;
const LINE_LIMIT = 20;
const transactionOptions = {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    timeout: 20000,
};
const decimal = (value: Prisma.Decimal.Value | null) =>
    new Prisma.Decimal(value ?? 0);

/** Catalog, NOT a filtered/global health report. No per-SKU accounting N+1 scan. */
export async function listReconciliationCatalog(
    db: PrismaClient,
    query: string,
    page: number,
): Promise<ReconciliationCatalog> {
    return db.$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const rows = await tx.productVariant.findMany({
            where: {
                product: { productType: 'OPERATIONAL' },
                ...(query
                    ? {
                          OR: [
                              {
                                  skuCode: {
                                      contains: query,
                                      mode: 'insensitive' as const,
                                  },
                              },
                              {
                                  name: {
                                      contains: query,
                                      mode: 'insensitive' as const,
                                  },
                              },
                          ],
                      }
                    : { inventories: { some: { quantity: { not: 0 } } } }),
            },
            select: {
                id: true,
                skuCode: true,
                name: true,
                primaryUnit: true,
                archivedAt: true,
            },
            orderBy: [{ skuCode: 'asc' }, { id: 'asc' }],
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE + 1,
        });
        return {
            page,
            hasMore: rows.length > PAGE_SIZE,
            items: rows.slice(0, PAGE_SIZE).map((row) => ({
                id: row.id,
                skuCode: row.skuCode,
                name: row.name,
                unit: row.primaryUnit,
                archived: row.archivedAt !== null,
            })),
        };
    }, transactionOptions);
}

/** Same signed basis and positive-stock valuation as health, without inferring historical causes. */
export async function inspectInventoryReconciliation(
    db: PrismaClient,
    variantId: string,
): Promise<InventoryReconciliationDiagnosis> {
    return db.$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const variant = await tx.productVariant.findUnique({
            where: { id: variantId },
            select: {
                id: true,
                skuCode: true,
                name: true,
                primaryUnit: true,
                archivedAt: true,
                product: { select: { productType: true } },
            },
        });
        if (!variant || variant.product.productType !== 'OPERATIONAL')
            throw new NotFoundError('Barang operasional');
        const stock = await tx.inventory.findMany({
            where: { productVariantId: variant.id },
            select: {
                quantity: true,
                averageCost: true,
                location: {
                    select: {
                        id: true,
                        name: true,
                        locationType: true,
                        packagingOwnerCustomerId: true,
                    },
                },
            },
            orderBy: { locationId: 'asc' },
            take: LOCATION_LIMIT + 1,
        });
        if (stock.length > LOCATION_LIMIT)
            throw new BusinessRuleError(
                'Lokasi SKU melebihi batas pemeriksaan. Minta tim sistem memeriksa cakupan lengkap.',
            );
        const pools = await skuInventoryBasis(tx, variant.id);
        const accounts = await tx.account.findMany({
            where: { id: { in: [...pools.keys()] } },
            select: { id: true, code: true, name: true },
            orderBy: { code: 'asc' },
        });
        const stockValue = stock
            .filter((row) => row.quantity.gt(0))
            .reduce(
                (sum, row) => sum.plus(row.quantity.mul(row.averageCost ?? 0)),
                decimal(0),
            );
        const basisTotal = [...pools.values()].reduce(
            (sum, value) => sum.plus(value),
            decimal(0),
        );
        const hasStock = stock.some((row) => row.quantity.gt(0));
        const healthFlagged =
            hasStock &&
            (!stockValue.gt(0) || basisTotal.lt(stockValue.minus(1)));
        const findings: ReconciliationFinding[] = [];
        const add = (code: string, title: string, nextStep: string) =>
            findings.push({ code, title, nextStep });
        if (variant.archivedAt)
            add(
                'ARCHIVED',
                'SKU diarsipkan',
                'Periksa riwayat; pengarsipan bukan penyelesaian selisih nilai.',
            );
        if (stock.some((row) => row.quantity.gt(0) && row.averageCost === null))
            add(
                'UNKNOWN_COST',
                'Biaya lokasi belum diketahui',
                'Finance perlu bukti harga dan satuan dari saldo awal/penerimaan. Jangan menggunakan harga jual.',
            );
        if (
            stock.some((row) => row.quantity.gt(0) && row.averageCost?.isZero())
        )
            add(
                'ZERO_COST',
                'Biaya lokasi tercatat nol',
                'Konfirmasi apakah nol disengaja atau bukti harga belum lengkap. Pemakaian internal tetap memerlukan biaya positif.',
            );
        if (
            stock.some((row) => row.quantity.lt(0) || row.averageCost?.lt(0)) ||
            [...pools.values()].some((value) => value.lt(0))
        )
            add(
                'NEGATIVE_VALUE',
                'Ada jumlah, biaya, atau basis negatif',
                'Periksa sumber dan koreksi sebelumnya; nilai negatif tidak disembunyikan atau dianggap dana tersedia.',
            );
        if (hasStock && basisTotal.lt(stockValue.minus(1)))
            add(
                'BASIS_SHORTFALL',
                'Basis jurnal lebih kecil dari nilai stok',
                'Cocokkan saldo awal, penerimaan dan jurnal keluar. Selisih ini belum membuktikan penyebab atau nominal koreksi yang sah.',
            );
        if (basisTotal.gt(stockValue.plus(1)))
            add(
                'BASIS_EXCESS',
                'Basis jurnal lebih besar dari nilai stok',
                'Telusuri nilai keluar dan atribusi sumber; jangan membuat penyesuaian kuantitas untuk menyamakan angka.',
            );
        if ([...pools.values()].filter((value) => value.gt(0)).length > 1)
            add(
                'SPLIT_BASIS',
                'Basis tersebar di beberapa akun',
                'Total cukup belum menjamin pemakaian dapat dibebankan ke satu akun. Periksa akun sumber dan jumlah transaksi sebenarnya.',
            );
        if (!pools.size)
            add(
                'NO_LINKED_BASIS',
                'Tidak ada basis jurnal yang memenuhi aturan sumber',
                'Periksa jurnal POSTED, akun yang memenuhi syarat dan tautannya ke mutasi SKU. Ini bukan bukti bahwa barang belum pernah dibayar/dibebankan.',
            );
        if (!hasStock)
            add(
                'NO_POSITIVE_STOCK',
                'Tidak ada stok positif',
                'Periksa saldo lokasi dan riwayat sebelum transaksi; SKU ini tidak masuk pemeriksaan stok positif harian.',
            );
        if (
            stock.some(
                (row) =>
                    row.location.locationType !== 'INTERNAL' ||
                    row.location.packagingOwnerCustomerId,
            )
        )
            add(
                'CUSTODY',
                'Ada lokasi noninternal atau milik pelanggan',
                'Periksa kepemilikan. Pemakaian internal tidak boleh memakai stok pelanggan/maklon.',
            );
        const movementCount = await tx.stockMovement.count({
            where: { productVariantId: variant.id },
        });
        const movements = await tx.stockMovement.findMany({
            where: { productVariantId: variant.id },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: EVIDENCE_LIMIT,
            select: {
                id: true,
                type: true,
                quantity: true,
                cost: true,
                createdAt: true,
                fromLocation: { select: { name: true } },
                toLocation: { select: { name: true } },
                goodsReceipt: { select: { receiptNumber: true } },
            },
        });
        const journals = await tx.journalEntry.findMany({
            where: { referenceId: { in: movements.map((row) => row.id) } },
            orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
            take: EVIDENCE_LIMIT + 1,
            select: {
                id: true,
                entryNumber: true,
                referenceId: true,
                entryDate: true,
                status: true,
                referenceType: true,
                isAutoGenerated: true,
                lines: {
                    orderBy: { id: 'asc' },
                    take: LINE_LIMIT + 1,
                    select: {
                        debit: true,
                        credit: true,
                        currency: true,
                        account: { select: { code: true, name: true } },
                    },
                },
            },
        });
        return {
            variant: {
                id: variant.id,
                skuCode: variant.skuCode,
                name: variant.name,
                unit: variant.primaryUnit,
                archived: variant.archivedAt !== null,
            },
            checkedAt: new Date().toISOString(),
            stockValue: stockValue.toFixed(4),
            basisTotal: basisTotal.toFixed(2),
            difference: stockValue.minus(basisTotal).toFixed(4),
            healthFlagged,
            locations: stock.map((row) => ({
                id: row.location.id,
                name: row.location.name,
                quantity: row.quantity.toString(),
                averageCost: row.averageCost?.toFixed(4) ?? null,
                value: row.quantity.mul(row.averageCost ?? 0).toFixed(4),
                companyInternal:
                    row.location.locationType === 'INTERNAL' &&
                    !row.location.packagingOwnerCustomerId,
            })),
            basis: accounts.map((account) => ({
                accountId: account.id,
                code: account.code,
                name: account.name,
                value: pools.get(account.id)!.toFixed(2),
            })),
            findings,
            movements: movements.map((row) => ({
                id: row.id,
                type: row.type,
                quantity: row.quantity.toString(),
                cost: row.cost?.toFixed(4) ?? null,
                createdAt: row.createdAt.toISOString(),
                from: row.fromLocation?.name ?? null,
                to: row.toLocation?.name ?? null,
                receiptNumber: row.goodsReceipt?.receiptNumber ?? null,
            })),
            journals: journals.slice(0, EVIDENCE_LIMIT).map((row) => ({
                id: row.id,
                number: row.entryNumber,
                movementId: row.referenceId!,
                date: row.entryDate.toISOString(),
                status: row.status,
                referenceType: row.referenceType,
                autoGenerated: row.isAutoGenerated,
                linesTruncated: row.lines.length > LINE_LIMIT,
                lines: row.lines.slice(0, LINE_LIMIT).map((line) => ({
                    accountCode: line.account.code,
                    accountName: line.account.name,
                    debit: line.debit.toFixed(2),
                    credit: line.credit.toFixed(2),
                    currency: line.currency,
                })),
            })),
            coverage: {
                movementCount,
                movementsTruncated: movementCount > movements.length,
                journalsTruncated: journals.length > EVIDENCE_LIMIT,
            },
        };
    }, transactionOptions);
}
