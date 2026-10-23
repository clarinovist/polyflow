import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import {
    BusinessRuleError,
    NotFoundError,
    ValidationError,
} from '@/lib/errors/errors';
import {
    internalUsageSchema,
    type InternalUsageInput,
} from '@/lib/schemas/internal-usage';
import {
    toBusinessDateString,
    normalizeToBusinessDay,
} from '@/lib/utils/timezone';
import { getNextSequence } from '@/lib/utils/sequence';
import { logActivity } from '@/lib/tools/audit';
import { createJournalEntry } from '@/services/accounting/journal-posting';
import { InventoryCoreService } from './core-service';
import {
    assertInternalUsageAccounting,
    resolveInternalUsageAccounts,
} from './internal-usage-accounting';
import {
    internalUsageRecordSelect,
    serializeInternalUsage,
} from './internal-usage-query-service';

export async function createInternalUsage(
    input: InternalUsageInput,
    actorId: string,
) {
    const parsed = internalUsageSchema.safeParse(input);
    if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0].message);
    const data = parsed.data;
    const { requestId, ...intent } = data;
    const requestHash = createHash('sha256')
        .update(JSON.stringify({ ...intent, actorId }))
        .digest('hex');
    return prisma.$transaction(
        async (tx) => {
            // Serializes one intent across tabs/retries without poisoning the transaction on a unique violation.
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`internal-usage:${requestId}`}, 0))::text`;
            const existing = await tx.internalUsage.findUnique({
                where: { requestId },
                select: { ...internalUsageRecordSelect, requestHash: true },
            });
            if (existing) {
                if (existing.requestHash !== requestHash)
                    throw new BusinessRuleError(
                        'Permintaan ini sudah dipakai untuk catatan berbeda. Buka formulir baru.',
                    );
                return serializeInternalUsage(existing);
            }
            const now = new Date();
            if (data.date !== toBusinessDateString(now)) {
                throw new BusinessRuleError(
                    'Pemakaian internal dicatat pada hari ini (WIB). Muat ulang formulir; pencatatan mundur atau tanggal mendatang belum didukung.',
                );
            }
            // Stabilize product metadata until its unit/type snapshot and accounting basis are persisted.
            await tx.$queryRaw`SELECT v.id FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId" WHERE v.id = ${data.productVariantId} FOR SHARE OF v, p`;
            const variant = await tx.productVariant.findUnique({
                where: { id: data.productVariantId },
                include: { product: true },
            });
            if (
                !variant ||
                variant.archivedAt ||
                variant.product.productType !== 'OPERATIONAL'
            ) {
                throw new BusinessRuleError(
                    'Pilih Barang Operasional yang masih aktif. Bahan produksi dan aset tetap tidak dapat dipakai di sini.',
                );
            }
            if (variant.primaryUnit !== data.unit)
                throw new BusinessRuleError(
                    'Satuan stok berubah. Muat ulang formulir.',
                );
            if (data.unit !== 'KG' && !Number.isInteger(data.quantity))
                throw new ValidationError(
                    `Jumlah ${data.unit} harus bilangan bulat.`,
                );
            await tx.$queryRaw`SELECT id FROM "Location" WHERE id = ${data.locationId} FOR SHARE`;
            const location = await tx.location.findUnique({
                where: { id: data.locationId },
            });
            if (
                !location ||
                location.locationType !== 'INTERNAL' ||
                location.packagingOwnerCustomerId
            ) {
                throw new BusinessRuleError(
                    'Pilih lokasi internal milik perusahaan, bukan stok pelanggan atau maklon.',
                );
            }
            const actor = await tx.user.findUnique({
                where: { id: actorId },
                select: { name: true, isActive: true },
            });
            if (!actor?.isActive)
                throw new NotFoundError('Petugas aktif', actorId);
            const before = await InventoryCoreService.validateAndLockStock(
                tx,
                location.id,
                variant.id,
                data.quantity,
            );
            const inventory = await tx.inventory.findUnique({
                where: {
                    locationId_productVariantId: {
                        locationId: location.id,
                        productVariantId: variant.id,
                    },
                },
            });
            const cost = inventory?.averageCost;
            if (!cost || cost.lte(0))
                throw new BusinessRuleError(
                    'Biaya persediaan di gudang ini belum tersedia. Minta Finance mencocokkan penerimaan ATK; harga jual tidak dapat dipakai sebagai biaya.',
                );
            const amount = cost.mul(data.quantity).toDecimalPlaces(2);
            if (amount.lte(0) || amount.gt('9999999999999.99'))
                throw new BusinessRuleError(
                    'Nilai pemakaian di luar batas pencatatan jurnal.',
                );
            const [year, month] = data.date.split('-').map(Number);
            await tx.$queryRaw`SELECT id FROM "FiscalPeriod" WHERE year = ${year} AND month = ${month} FOR SHARE`;
            const accountIds = await resolveInternalUsageAccounts(
                variant.product.inventoryAccountId,
            );
            await assertInternalUsageAccounting(
                tx,
                variant.id,
                accountIds,
                amount,
            );
            const number = await getNextSequence(
                `PI-${data.date.slice(0, 7).replace('-', '')}`,
                tx,
            );
            const movement = await tx.stockMovement.create({
                data: {
                    type: 'OUT',
                    productVariantId: variant.id,
                    fromLocationId: location.id,
                    quantity: data.quantity,
                    cost,
                    reference: `${number} · Pemakaian internal`,
                    createdById: actorId,
                    createdAt: now,
                    companyOwned: true,
                },
            });
            const journal = await createJournalEntry(
                {
                    entryDate: normalizeToBusinessDay(now),
                    description: `Pemakaian internal ${number}: ${variant.name}`,
                    reference: number,
                    referenceType: 'MANUAL_ENTRY',
                    referenceId: movement.id,
                    status: 'POSTED',
                    isAutoGenerated: true,
                    createdById: actorId,
                    lines: [
                        {
                            accountId: accountIds.expense,
                            debit: amount.toNumber(),
                            credit: 0,
                            description: 'Beban pemakaian internal',
                        },
                        {
                            accountId: accountIds.inventory,
                            debit: 0,
                            credit: amount.toNumber(),
                            description: 'Persediaan barang operasional',
                        },
                    ],
                },
                tx,
            );
            await InventoryCoreService.deductStock(
                tx,
                location.id,
                variant.id,
                data.quantity,
            );
            const record = await tx.internalUsage.create({
                data: {
                    number,
                    requestId,
                    requestHash,
                    movementId: movement.id,
                    journalId: journal.id,
                    productName: variant.name,
                    skuCode: variant.skuCode,
                    unit: variant.primaryUnit,
                    locationName: location.name,
                    recipient: data.recipient,
                    department: data.department,
                    purpose: data.purpose,
                    recordedByName: actor.name || 'Petugas Gudang',
                    stockBefore: before,
                    stockAfter: new Prisma.Decimal(before).minus(data.quantity),
                    inventoryAccountId: accountIds.inventory,
                    expenseAccountId: accountIds.expense,
                    createdAt: now,
                },
                select: internalUsageRecordSelect,
            });
            await logActivity({
                userId: actorId,
                action: 'CREATE_INTERNAL_USAGE',
                entityType: 'InternalUsage',
                entityId: record.id,
                details: `${number}: ${data.quantity} ${variant.primaryUnit}; movement=${movement.id}; journal=${journal.id}`,
                tx,
            });
            return serializeInternalUsage(record);
        },
        { timeout: 20000 },
    );
}
