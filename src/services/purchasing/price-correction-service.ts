import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors/errors';
import {
    allocatePurchasePriceCorrection,
    purchasePriceCorrectionInput,
    purchasePricePreviewInput,
    roundPurchaseMoney,
} from '@/lib/finance/purchase-price-correction';
import { resolveReceiptNetUnitCost } from '@/lib/purchasing/receipt-valuation';
import { logActivity } from '@/lib/tools/audit';
import { normalizeToBusinessDay } from '@/lib/utils/timezone';
import { resolveAccount } from '@/services/accounting/account-resolver';
import { resolveAccountCode } from '@/services/accounting/account-mapping-policy';
import { generateEntryNumber } from '@/services/accounting/journal-posting';
import { requireOpenJournalPeriod } from '@/services/finance/sales-recognition-service';
import { calculatePurchaseOrderTotals } from './orders-service';
import { calculatePoInvoiceTotalFromReceipts, createDraftBillFromPo } from './invoices-service';
import { calculatePurchaseJournalAmounts } from './finance/purchase-bill-journal-sync';

function tenantDb() {
    const db = getTenantDbFromContext();
    if (!db) throw new BusinessRuleError('Konteks tenant wajib untuk koreksi harga pembelian.');
    return db;
}
function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ValidationError('Instruksi koreksi tidak valid. Periksa identitas, harga positif (maksimal 4 desimal), alasan, dan konfirmasi.');
    return parsed.data;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function reject(code: string, message: string): never {
    throw new BusinessRuleError(message, undefined, code);
}
function assertBill(bills: Array<{ id: string; status: string; paidAmount: Prisma.Decimal; notes?: string | null }>, invoiceId: string) {
    if (bills.length !== 1 || bills[0].id !== invoiceId || bills[0].notes?.startsWith('Suplementer:')) {
        reject('PURCHASE_PRICE_BILL_AMBIGUOUS', 'Koreksi memerlukan tepat satu tagihan aktif tanpa tagihan suplementer. Rekonsiliasi terlebih dahulu.');
    }
    const bill = bills[0];
    if (!['DRAFT', 'UNPAID'].includes(bill.status) || !bill.paidAmount.isZero()) {
        reject('PURCHASE_PRICE_BILL_PROTECTED', 'Tagihan sudah dilindungi atau memiliki pembayaran. Koreksi harga tidak dapat dilanjutkan.');
    }
    return bill;
}

async function lockSource(tx: Prisma.TransactionClient, invoiceId: string) {
    const invoice = await tx.purchaseInvoice.findUnique({ where: { id: invoiceId }, select: { purchaseOrderId: true } });
    if (!invoice) throw new NotFoundError('Tagihan pembelian');
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${invoice.purchaseOrderId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "PurchaseInvoice" WHERE "purchaseOrderId" = ${invoice.purchaseOrderId} ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "PurchaseOrderItem" WHERE "purchaseOrderId" = ${invoice.purchaseOrderId} ORDER BY id FOR UPDATE`;
}

async function readSource(tx: Prisma.TransactionClient, invoiceId: string, lockInventory = false) {
    const invoice = await tx.purchaseInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundError('Tagihan pembelian');
    const po = await tx.purchaseOrder.findUnique({
        where: { id: invoice.purchaseOrderId },
        include: {
            items: { orderBy: { id: 'asc' }, include: { productVariant: { include: { product: true } } } },
            goodsReceipts: { orderBy: { id: 'asc' }, include: { items: { orderBy: { id: 'asc' } } } },
            invoices: { where: { status: { not: 'CANCELLED' } }, orderBy: { id: 'asc' } },
        },
    });
    if (!po) throw new NotFoundError('Pesanan pembelian');
    assertBill(po.invoices, invoiceId);
    if (po.status === 'CANCELLED') reject('PURCHASE_PRICE_INVALID_SOURCE', 'Pesanan pembelian sudah dibatalkan.');
    if (po.goodsReceipts.some(gr => gr.isMaklon)) {
        reject('PURCHASE_PRICE_MAKLON', 'Penerimaan maklon tidak dapat dikoreksi melalui koreksi harga pembelian.');
    }
    const receiptIds = po.goodsReceipts.map(gr => gr.id);
    const assets = await tx.fixedAsset.count({ where: { goodsReceiptId: { in: receiptIds } } });
    if (assets > 0 || po.items.some(item => item.productVariant.product.productType === 'FIXED_ASSET')) {
        reject('PURCHASE_PRICE_FIXED_ASSET', 'Penerimaan terkait aset tetap tidak dapat dikoreksi melalui aksi ini.');
    }
    const receipts = po.goodsReceipts.flatMap(gr => gr.items.map(row => {
        const candidates = po.items.filter(item => row.purchaseOrderItemId
            ? item.id === row.purchaseOrderItemId && item.productVariantId === row.productVariantId
            : item.productVariantId === row.productVariantId);
        if (candidates.length !== 1 || row.receivedQty.lte(0)) {
            reject('PURCHASE_PRICE_RECEIPT_AMBIGUOUS', 'Baris penerimaan tidak dapat ditelusuri ke satu baris PO. Rekonsiliasi terlebih dahulu.');
        }
        return { id: row.id, goodsReceiptId: gr.id, locationId: gr.locationId, purchaseOrderItemId: candidates[0].id, productVariantId: row.productVariantId, quantity: row.receivedQty.toFixed(4), unitCost: row.unitCost.toFixed(4) };
    }));
    const pairs = [...new Map(receipts.map(row => [`${row.locationId}:${row.productVariantId}`, {
        locationId: row.locationId, productVariantId: row.productVariantId,
    }])).values()].sort((a, b) => a.locationId.localeCompare(b.locationId) || a.productVariantId.localeCompare(b.productVariantId));
    const inventory = [];
    for (const pair of pairs) {
        if (lockInventory) {
            await tx.$queryRaw`SELECT id FROM "Inventory" WHERE "locationId" = ${pair.locationId} AND "productVariantId" = ${pair.productVariantId} FOR UPDATE`;
        }
        const row = await tx.inventory.findUnique({ where: { locationId_productVariantId: pair } });
        inventory.push({ ...pair, id: row?.id ?? null, quantity: row?.quantity.toFixed(4) ?? '0.0000', averageCost: row?.averageCost?.toFixed(4) ?? null });
    }
    const currentBillTotal = roundPurchaseMoney(await calculatePoInvoiceTotalFromReceipts(po.id, { tx, fallbackToPoTotal: false }));
    if (!currentBillTotal.equals(invoice.totalAmount)) {
        reject('PURCHASE_PRICE_BILL_MISMATCH', 'Total tagihan belum sesuai penerimaan. Sinkronkan tagihan terlebih dahulu.');
    }
    const evidence = {
        version: 1,
        purchaseOrderId: po.id,
        status: po.status,
        updatedAt: po.updatedAt.toISOString(),
        totalAmount: po.totalAmount?.toFixed(2) ?? '0.00',
        taxAmount: po.taxAmount?.toFixed(2) ?? '0.00',
        shippingCost: po.shippingCost?.toFixed(2) ?? '0.00',
        invoice: { id: invoice.id, status: invoice.status, totalAmount: invoice.totalAmount.toFixed(2), paidAmount: invoice.paidAmount.toFixed(2), invoiceDate: invoice.invoiceDate.toISOString(), updatedAt: invoice.updatedAt.toISOString() },
        items: po.items.map(item => ({ id: item.id, productVariantId: item.productVariantId, quantity: item.quantity.toFixed(4), receivedQty: item.receivedQty.toFixed(4), unitPrice: item.unitPrice.toFixed(4), discountPercent: item.discountPercent?.toString() ?? '0', taxPercent: item.taxPercent?.toString() ?? '0', ppnMode: item.ppnMode, inventoryAccountId: item.productVariant.product.inventoryAccountId })),
        receipts,
        inventory,
    };
    return { po, invoice, receipts, inventory, evidence, fingerprint: hash(evidence) };
}
type Source = Awaited<ReturnType<typeof readSource>>;

function preview(source: Source, purchaseOrderItemId: string, newUnitPrice: string) {
    const item = source.po.items.find(row => row.id === purchaseOrderItemId);
    if (!item) throw new NotFoundError('Baris pesanan pembelian');
    const oldNet = resolveReceiptNetUnitCost(item);
    const newNet = resolveReceiptNetUnitCost({ ...item, unitPrice: newUnitPrice });
    if (item.unitPrice.lte(0) || oldNet.lte(0)) reject('PURCHASE_PRICE_ZERO_COST', 'Baris dengan biaya nol tidak dapat dikoreksi melalui aksi ini.');
    if (item.unitPrice.equals(newUnitPrice)) reject('PURCHASE_PRICE_UNCHANGED', 'Harga baru harus berbeda dari harga saat ini.');
    const received = source.receipts.filter(row => row.purchaseOrderItemId === item.id);
    if (received.some(row => new Prisma.Decimal(row.unitCost).lte(0))) {
        reject('PURCHASE_PRICE_ZERO_COST', 'Penerimaan dengan biaya nol tidak dapat dikoreksi melalui aksi ini.');
    }
    const quantities = new Map<string, Prisma.Decimal>();
    for (const row of received) quantities.set(row.locationId, (quantities.get(row.locationId) ?? new Prisma.Decimal(0)).plus(row.quantity));
    const allocation = allocatePurchasePriceCorrection([...quantities].map(([locationId, quantity]) => {
        const stock = source.inventory.find(row => row.locationId === locationId && row.productVariantId === item.productVariantId)!;
        return { locationId, receivedQuantity: quantity, receiptDelta: newNet.minus(oldNet).mul(quantity), stockQuantity: stock.quantity, averageCost: stock.averageCost };
    }));
    const items = source.po.items.map(row => ({
        id: row.id, productVariantId: row.productVariantId, quantity: row.quantity.toNumber(),
        unitPrice: row.id === item.id ? Number(newUnitPrice) : row.unitPrice.toNumber(),
        discountPercent: Number(row.discountPercent ?? 0), taxPercent: Number(row.taxPercent ?? 0),
        ppnMode: row.ppnMode, dppOtherAmount: row.dppOtherAmount?.toNumber() ?? null,
    }));
    const totals = calculatePurchaseOrderTotals(items, Number(source.po.shippingCost ?? 0));
    const receivedItems = items.map(row => ({ ...row, quantity: source.receipts.filter(receipt => receipt.purchaseOrderItemId === row.id).reduce((sum, receipt) => sum + Number(receipt.quantity), 0) }));
    // Same helper and rounding as the existing receipt-based bill calculation.
    const billTotal = new Prisma.Decimal(Math.round(calculatePurchaseOrderTotals(receivedItems, Number(source.po.shippingCost ?? 0)).finalTotal * 100) / 100);
    const before = calculatePurchaseJournalAmounts(source.invoice.totalAmount, source.po.totalAmount ?? 0, source.po.taxAmount ?? 0);
    const after = calculatePurchaseJournalAmounts(billTotal, roundPurchaseMoney(totals.finalTotal), roundPurchaseMoney(totals.totalTax));
    return {
        item, totals, billTotal,
        public: {
            invoiceId: source.invoice.id, purchaseOrderId: source.po.id, purchaseOrderItemId: item.id,
            oldUnitPrice: item.unitPrice.toFixed(4), newUnitPrice,
            oldNetUnitCost: oldNet.toFixed(4), newNetUnitCost: newNet.toFixed(4),
            sourceFingerprint: source.fingerprint,
            billTotalBefore: source.invoice.totalAmount.toFixed(2), billTotalAfter: billTotal.toFixed(2),
            billTotalDelta: roundPurchaseMoney(after.total).minus(before.total).toFixed(2),
            billNetDelta: roundPurchaseMoney(after.subtotal).minus(before.subtotal).toFixed(2),
            billTaxDelta: roundPurchaseMoney(after.tax).minus(before.tax).toFixed(2),
            ...allocation,
        },
    };
}

export async function getPurchasePriceCorrectionContext(invoiceId: string) {
    parseInput(z.string().min(1, 'Identitas tagihan wajib diisi.').max(100, 'Identitas tagihan terlalu panjang.'), invoiceId);
    return tenantDb().$transaction(async tx => {
        const source = await readSource(tx, invoiceId);
        const history = await tx.purchasePriceCorrection.findMany({ where: { invoiceId }, orderBy: { createdAt: 'desc' }, take: 100 });
        return {
            invoiceId, purchaseOrderId: source.po.id, sourceFingerprint: source.fingerprint,
            billTotal: source.invoice.totalAmount.toFixed(2),
            items: source.po.items.map(item => ({
                purchaseOrderItemId: item.id, productVariantId: item.productVariantId,
                name: item.productVariant.name, unitPrice: item.unitPrice.toFixed(4),
                receivedQuantity: source.receipts.filter(row => row.purchaseOrderItemId === item.id).reduce((sum, row) => sum.plus(row.quantity), new Prisma.Decimal(0)).toFixed(4),
                receipts: source.receipts.filter(row => row.purchaseOrderItemId === item.id),
                inventory: source.inventory.filter(row => row.productVariantId === item.productVariantId),
            })),
            history,
        };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function previewPurchasePriceCorrection(input: unknown) {
    const data = parseInput(purchasePricePreviewInput, input);
    return tenantDb().$transaction(async tx => {
        const source = await readSource(tx, data.invoiceId);
        await requireOpenJournalPeriod(tx, normalizeToBusinessDay(new Date()));
        return preview(source, data.purchaseOrderItemId, data.newUnitPrice).public;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function postPurchasePriceCorrection(input: unknown, userId: string) {
    const data = parseInput(purchasePriceCorrectionInput, input);
    const signature = hash(data);
    return tenantDb().$transaction(async tx => {
        await lockSource(tx, data.invoiceId);
        const prior = await tx.purchasePriceCorrection.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
        if (prior) {
            if (prior.requestSignature !== signature) reject('PURCHASE_PRICE_IDEMPOTENCY_CONFLICT', 'Kunci transaksi sudah digunakan dengan instruksi berbeda.');
            return prior;
        }
        const source = await readSource(tx, data.invoiceId, true);
        if (source.fingerprint !== data.sourceFingerprint) reject('PURCHASE_PRICE_SOURCE_CHANGED', 'Harga, tagihan, atau stok berubah. Muat ulang pratinjau dan konfirmasi kembali.');
        const calculated = preview(source, data.purchaseOrderItemId, data.newUnitPrice);
        const amounts = calculated.public;
        const postingDate = normalizeToBusinessDay(new Date());
        await requireOpenJournalPeriod(tx, postingDate);
        const product = calculated.item.productVariant.product;
        const inventoryAccountId = product.inventoryAccountId ?? (await resolveAccountCode(product.productType, 'inventory')).id;
        const clearing = await resolveAccount('gr-clearing');
        const cogs = await resolveAccount('cogs');
        const accountIds = [inventoryAccountId, clearing.id, cogs.id];
        await tx.$queryRaw`SELECT id FROM "Account" WHERE id IN (${Prisma.join(accountIds)}) ORDER BY id FOR SHARE`;
        if (new Set(accountIds).size !== 3 || await tx.account.count({ where: { id: { in: accountIds }, isActive: true } }) !== 3) {
            reject('PURCHASE_PRICE_ACCOUNT_INVALID', 'Akun persediaan, GR/IR, dan HPP harus aktif dan berbeda.');
        }
        const itemTotals = calculated.totals.itemsWithTotals[source.po.items.findIndex(item => item.id === data.purchaseOrderItemId)];
        await tx.purchaseOrderItem.update({ where: { id: data.purchaseOrderItemId }, data: { unitPrice: data.newUnitPrice, subtotal: roundPurchaseMoney(itemTotals.subtotal), taxAmount: roundPurchaseMoney(itemTotals.taxAmount) } });
        await tx.purchaseOrder.update({ where: { id: source.po.id }, data: { totalAmount: roundPurchaseMoney(calculated.totals.finalTotal), taxAmount: roundPurchaseMoney(calculated.totals.totalTax), discountAmount: roundPurchaseMoney(calculated.totals.totalDiscount) } });
        const synced = await createDraftBillFromPo(source.po.id, userId, { tx });
        const bills = await tx.purchaseInvoice.findMany({ where: { purchaseOrderId: source.po.id, status: { not: 'CANCELLED' } } });
        assertBill(bills, data.invoiceId);
        if (!synced || synced.id !== data.invoiceId || !new Prisma.Decimal(synced.totalAmount).equals(calculated.billTotal) || !bills[0].totalAmount.equals(calculated.billTotal)) {
            reject('PURCHASE_PRICE_SYNC_FAILED', 'Sinkronisasi tagihan ditolak atau hasilnya tidak sesuai pratinjau. Tidak ada koreksi yang disimpan.');
        }
        for (const row of amounts.locations) {
            if (new Prisma.Decimal(row.stockQuantity).gt(0) && row.newAverageCost !== null) {
                await tx.inventory.update({ where: { locationId_productVariantId: { locationId: row.locationId, productVariantId: calculated.item.productVariantId } }, data: { averageCost: row.newAverageCost } });
            }
        }
        const correctionId = randomUUID();
        const line = (accountId: string, debit: string | Prisma.Decimal) => {
            const value = new Prisma.Decimal(debit);
            return { accountId, debit: Prisma.Decimal.max(value, 0), credit: Prisma.Decimal.max(value.negated(), 0) };
        };
        const lines = [
            ...amounts.locations.filter(row => row.inventoryAmount !== '0.00').map(row => line(inventoryAccountId, row.inventoryAmount)),
            ...(new Prisma.Decimal(amounts.varianceAmount).isZero() ? [] : [line(cogs.id, amounts.varianceAmount)]),
            line(clearing.id, new Prisma.Decimal(amounts.receiptAmount).negated()),
        ];
        const journal = await tx.journalEntry.create({ data: {
            entryNumber: await generateEntryNumber(postingDate, tx), entryDate: postingDate,
            description: 'Koreksi harga pembelian', reference: `PURCHASE_PRICE:${correctionId}`,
            referenceType: 'MANUAL_ENTRY', referenceId: correctionId,
            status: 'POSTED', isAutoGenerated: true, createdById: userId, approvedById: userId, approvedAt: new Date(),
            lines: { create: lines },
        } });
        const result = await tx.purchasePriceCorrection.create({ data: {
            id: correctionId, purchaseOrderId: source.po.id, purchaseOrderItemId: data.purchaseOrderItemId, invoiceId: data.invoiceId,
            oldUnitPrice: amounts.oldUnitPrice, newUnitPrice: data.newUnitPrice,
            receiptAmount: amounts.receiptAmount, inventoryAmount: amounts.inventoryAmount, varianceAmount: amounts.varianceAmount,
            billTotalDelta: amounts.billTotalDelta, billNetDelta: amounts.billNetDelta, billTaxDelta: amounts.billTaxDelta,
            locationAllocations: amounts.locations,
            sourceEvidence: { ...source.evidence, accounts: { inventoryAccountId, clearingAccountId: clearing.id, cogsAccountId: cogs.id }, oldNetUnitCost: amounts.oldNetUnitCost, newNetUnitCost: amounts.newNetUnitCost },
            sourceFingerprint: data.sourceFingerprint, journalId: journal.id, postingDate, reason: data.reason,
            idempotencyKey: data.idempotencyKey, requestSignature: signature, createdById: userId,
        } });
        await logActivity({ userId, action: 'POST_PURCHASE_PRICE_CORRECTION', entityType: 'PurchaseInvoice', entityId: data.invoiceId, details: data.reason, changes: { correctionId, journalId: journal.id, oldUnitPrice: amounts.oldUnitPrice, newUnitPrice: data.newUnitPrice, receiptAmount: amounts.receiptAmount, inventoryAmount: amounts.inventoryAmount, varianceAmount: amounts.varianceAmount }, tx });
        return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 });
}
