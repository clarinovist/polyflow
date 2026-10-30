import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { tenantContext } from '@/lib/core/prisma';
import { runWithActor } from '@/lib/core/actor-context';
import { getWibMonthBounds, toBusinessDateString } from '@/lib/utils/timezone';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { clearAccountCache } from '@/services/accounting/account-resolver';
import { returnTestClient, verifyReturnTestDatabase } from '../../finance/__tests__/return-credit-postgres-fixture';
import { createGoodsReceipt, reverseGoodsReceipt } from '../receipts-service';
import { getPurchasePriceCorrectionContext, postPurchasePriceCorrection, previewPurchasePriceCorrection } from '../price-correction-service';
import { calculatePurchaseOrderTotals } from '../orders-service';

const url = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = url ? returnTestClient(url) : null;
const actor = 'purchase-price-actor';
const locationId = 'purchase-price-location';
const productVariantId = 'purchase-price-variant';
const purchaseOrderId = 'purchase-price-po';
const purchaseOrderItemId = 'purchase-price-item';
const accounts = { inventory: randomUUID(), clearing: randomUUID(), vat: randomUUID(), payable: randomUUID(), cogs: randomUUID() };
const inventoryKey = { locationId_productVariantId: { locationId, productVariantId } };
const run = <T>(client: PrismaClient, callback: () => Promise<T>) => tenantContext.run(client, () => runWithActor(actor, callback));
const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

async function seed(client: PrismaClient) {
    await verifyReturnTestDatabase(client);
    await client.$executeRaw`TRUNCATE "Product", "Location", "User", "Account", "Supplier", "FiscalPeriod", "SystemSequence", "AuditLog" CASCADE`;
    clearAccountCache();
    await client.user.create({ data: { id: actor, email: 'purchase-price@example.invalid', password: 'synthetic-only', role: 'FINANCE' } });
    await client.account.createMany({ data: [
        { id: accounts.inventory, code: '11310', name: 'Synthetic inventory', type: 'ASSET', category: 'CURRENT_ASSET' },
        { id: accounts.clearing, code: '21140', name: 'Synthetic GR/IR', type: 'LIABILITY', category: 'CURRENT_LIABILITY' },
        { id: accounts.vat, code: '21320', name: 'Synthetic VAT input', type: 'ASSET', category: 'CURRENT_ASSET' },
        { id: accounts.payable, code: '21110', name: 'Synthetic payable', type: 'LIABILITY', category: 'CURRENT_LIABILITY' },
        { id: accounts.cogs, code: '51100', name: 'Synthetic COGS', type: 'EXPENSE', category: 'COGS' },
    ] });
    await client.location.create({ data: { id: locationId, name: 'Gudang Sintetis', slug: 'purchase-price-location' } });
    await client.product.create({ data: { id: 'purchase-price-product', name: 'Synthetic material', productType: 'RAW_MATERIAL', inventoryAccountId: accounts.inventory } });
    await client.productVariant.create({ data: { id: productVariantId, productId: 'purchase-price-product', name: 'Synthetic variant', skuCode: 'SYNTHETIC-PRICE', primaryUnit: 'KG' } });
    await client.supplier.create({ data: { id: 'purchase-price-supplier', name: 'Synthetic supplier' } });
    await client.purchaseOrder.create({ data: {
        id: purchaseOrderId, orderNumber: 'PO-SYNTHETIC-PRICE', supplierId: 'purchase-price-supplier', status: 'SENT', totalAmount: 1110, taxAmount: 110,
        items: { create: { id: purchaseOrderItemId, productVariantId, quantity: 10, receivedQty: 0, unitPrice: 100, subtotal: 1110, discountPercent: 0, taxPercent: 11, taxAmount: 110, ppnMode: 'EXCLUDE' } },
    } });
    const [year, month] = toBusinessDateString(new Date()).split('-').map(Number);
    const bounds = getWibMonthBounds(year, month);
    await client.fiscalPeriod.create({ data: { name: 'Synthetic open period', year, month, startDate: bounds.start, endDate: bounds.end, status: 'OPEN' } });
    await client.systemSequence.create({ data: { key: `JOURNAL_ENTRY_${year}`, value: 100 } });
}
async function receive(client: PrismaClient, qty = 10, targetLocationId = locationId) {
    return run(client, () => createGoodsReceipt({ purchaseOrderId, locationId: targetLocationId, receivedDate: new Date(), isMaklon: false, notes: 'Penerimaan sintetis', items: [{ purchaseOrderItemId, productVariantId, receivedQty: qty }] }, actor));
}
async function consume(client: PrismaClient, qty: number) {
    return run(client, () => client.$transaction(async tx => {
        await InventoryCoreService.validateAndLockStock(tx, locationId, productVariantId, qty);
        await InventoryCoreService.deductStock(tx, locationId, productVariantId, qty);
        await tx.stockMovement.create({ data: { type: 'OUT', productVariantId, fromLocationId: locationId, quantity: qty, cost: 100, reference: 'Synthetic consumption', createdById: actor } });
    }));
}
async function request(client: PrismaClient, newUnitPrice: string) {
    const invoice = await client.purchaseInvoice.findFirstOrThrow({ where: { purchaseOrderId } });
    const preview = await run(client, () => previewPurchasePriceCorrection({ invoiceId: invoice.id, purchaseOrderItemId, newUnitPrice }));
    return { invoiceId: invoice.id, purchaseOrderItemId, newUnitPrice, sourceFingerprint: preview.sourceFingerprint, reason: 'Koreksi harga sintetis', idempotencyKey: randomUUID(), confirmed: true };
}
async function sourceQuantities(client: PrismaClient) {
    return JSON.stringify(await Promise.all([
        client.inventory.findMany({ orderBy: { id: 'asc' }, select: { id: true, locationId: true, productVariantId: true, quantity: true } }),
        client.stockMovement.findMany({ orderBy: { id: 'asc' } }),
        client.goodsReceipt.findMany({ orderBy: { id: 'asc' }, include: { items: { orderBy: { id: 'asc' } } } }),
    ]));
}
async function snapshot(client: PrismaClient) {
    return JSON.stringify(await Promise.all([
        client.inventory.findMany({ orderBy: { id: 'asc' } }),
        client.stockMovement.findMany({ orderBy: { id: 'asc' } }),
        client.goodsReceipt.findMany({ orderBy: { id: 'asc' }, include: { items: { orderBy: { id: 'asc' } } } }),
        client.purchaseOrder.findMany({ orderBy: { id: 'asc' }, include: { items: { orderBy: { id: 'asc' } } } }),
        client.purchaseInvoice.findMany({ orderBy: { id: 'asc' } }),
        client.journalEntry.findMany({ orderBy: { id: 'asc' }, include: { lines: { orderBy: { id: 'asc' } } } }),
        client.purchasePriceCorrection.findMany({ orderBy: { id: 'asc' } }),
        client.auditLog.findMany({ orderBy: { id: 'asc' } }),
    ]));
}
async function balances(client: PrismaClient) {
    const journals = await client.journalEntry.findMany({ where: { status: 'POSTED' }, include: { lines: true } });
    const balances = new Map<string, Prisma.Decimal>();
    for (const journal of journals) {
        const difference = journal.lines.reduce((sum, line) => sum.plus(line.debit).minus(line.credit), decimal(0));
        expect(difference.toFixed(2)).toBe('0.00');
        for (const line of journal.lines) balances.set(line.accountId, (balances.get(line.accountId) ?? decimal(0)).plus(line.debit).minus(line.credit));
    }
    return balances;
}

describe.skipIf(!db)('purchase price correction PostgreSQL contract', () => {
    beforeEach(async () => seed(db!));
    afterAll(async () => { clearAccountCache(); await db?.$disconnect(); });

    it('receives, consumes partially, raises then lowers price without quantity changes or GR/IR drift', async () => {
        const receipt = await receive(db!);
        await consume(db!, 6);
        const quantities = await sourceQuantities(db!);
        for (const [price, receiptDelta, inventoryDelta, variance, bill] of [
            ['120', '200.00', '80.00', '120.00', '1332.00'],
            ['90', '-300.00', '-120.00', '-180.00', '999.00'],
        ]) {
            const data = await request(db!, price);
            const result = await run(db!, () => postPurchasePriceCorrection(data, actor));
            expect(result.receiptAmount.toFixed(2)).toBe(receiptDelta);
            expect(result.inventoryAmount.toFixed(2)).toBe(inventoryDelta);
            expect(result.varianceAmount.toFixed(2)).toBe(variance);
            expect(await sourceQuantities(db!)).toBe(quantities);
            const inventory = await db!.inventory.findUniqueOrThrow({ where: inventoryKey });
            expect(inventory.quantity.toFixed(4)).toBe('4.0000');
            expect(inventory.averageCost?.toFixed(4)).toBe(decimal(price).toFixed(4));
            expect((await db!.purchaseInvoice.findUniqueOrThrow({ where: { id: data.invoiceId } })).totalAmount.toFixed(2)).toBe(bill);
            const journal = await db!.journalEntry.findUniqueOrThrow({ where: { id: result.journalId }, include: { lines: true } });
            expect(journal.referenceType).toBe('MANUAL_ENTRY');
            expect(journal.reference).toBe(`PURCHASE_PRICE:${result.id}`);
            const totals = await balances(db!);
            // At the new price, receipt credit and bill debit cancel exactly (including VAT).
            expect(totals.get(accounts.clearing)?.toFixed(2)).toBe('0.00');
            expect(totals.get(accounts.payable)?.toFixed(2)).toBe(decimal(bill).negated().toFixed(2));
            expect(totals.get(accounts.vat)?.toFixed(2)).toBe(decimal(price).mul('1.1').toFixed(2));
            const beforeReplay = await snapshot(db!);
            expect((await run(db!, () => postPurchasePriceCorrection(data, actor))).id).toBe(result.id);
            expect(await snapshot(db!)).toBe(beforeReplay);
            await expect(run(db!, () => postPurchasePriceCorrection({ ...data, reason: 'Instruksi lain sintetis' }, actor))).rejects.toMatchObject({ code: 'PURCHASE_PRICE_IDEMPOTENCY_CONFLICT' });
        }
        const totals = await balances(db!);
        expect(totals.get(accounts.inventory)?.toFixed(2)).toBe('960.00');
        expect(totals.get(accounts.cogs)?.toFixed(2)).toBe('-60.00');
        expect(await db!.journalEntry.count({ where: { referenceType: 'PURCHASE_INVOICE' } })).toBe(3);
        const beforeReverse = await snapshot(db!);
        await expect(run(db!, () => reverseGoodsReceipt(receipt.id, actor))).rejects.toMatchObject({ code: 'PURCHASE_PRICE_CORRECTED' });
        expect(await snapshot(db!)).toBe(beforeReverse);
    });

    it('preserves named correction history after payment while keeping preview/post protected', async () => {
        await receive(db!);
        const data = await request(db!, '120');
        const context = await run(db!, () => getPurchasePriceCorrectionContext(data.invoiceId));
        expect(context.eligible).toBe(true);
        expect(context.items[0]).toMatchObject({ name: 'Synthetic variant', skuCode: 'SYNTHETIC-PRICE',
            receipts: [expect.objectContaining({ locationName: 'Gudang Sintetis' })],
            inventory: [expect.objectContaining({ locationName: 'Gudang Sintetis' })],
        });
        await db!.location.update({ where: { id: locationId }, data: { name: 'Gudang Sintetis Baru' } });
        const preview = await run(db!, () => previewPurchasePriceCorrection(data));
        expect(preview.sourceFingerprint).toBe(data.sourceFingerprint);
        expect(preview.locations[0]).toMatchObject({ locationName: 'Gudang Sintetis Baru', skuCode: 'SYNTHETIC-PRICE' });
        const correction = await run(db!, () => postPurchasePriceCorrection(data, actor));
        await db!.purchaseInvoice.update({ where: { id: data.invoiceId }, data: { status: 'PAID', paidAmount: '1332' } });
        const before = await snapshot(db!);
        const paid = await run(db!, () => getPurchasePriceCorrectionContext(data.invoiceId));
        expect(paid).toMatchObject({ eligible: false, reasonCode: 'PURCHASE_PRICE_BILL_PROTECTED', history: [expect.objectContaining({ id: correction.id })] });
        expect(paid.items[0]).toMatchObject({ name: 'Synthetic variant', skuCode: 'SYNTHETIC-PRICE' });
        await expect(run(db!, () => previewPurchasePriceCorrection({ ...data, newUnitPrice: '130' }))).rejects.toMatchObject({ code: 'PURCHASE_PRICE_BILL_PROTECTED' });
        await expect(run(db!, () => postPurchasePriceCorrection({ ...data, newUnitPrice: '130', idempotencyKey: randomUUID() }, actor))).rejects.toMatchObject({ code: 'PURCHASE_PRICE_BILL_PROTECTED' });
        expect(await snapshot(db!)).toBe(before);
    });

    it('revalues multiple locations separately', async () => {
        await db!.location.create({ data: { id: 'purchase-price-location-b', name: 'Gudang Sintetis B', slug: 'purchase-price-location-b' } });
        await receive(db!, 4);
        await receive(db!, 6, 'purchase-price-location-b');
        await consume(db!, 2);
        const quantities = await sourceQuantities(db!);
        const data = await request(db!, '120');
        const result = await run(db!, () => postPurchasePriceCorrection(data, actor));
        expect(result.inventoryAmount.toFixed(2)).toBe('160.00');
        expect(result.varianceAmount.toFixed(2)).toBe('40.00');
        expect(await sourceQuantities(db!)).toBe(quantities);
        const inventory = await db!.inventory.findMany();
        expect(inventory.every(row => row.averageCost?.equals(120))).toBe(true);
        expect((await balances(db!)).get(accounts.clearing)?.toFixed(2)).toBe('0.00');
    });

    it.each(['DRAFT', 'UNPAID'] as const)('supports %s bills and entirely consumed stock', async status => {
        await receive(db!);
        if (status === 'DRAFT') {
            await db!.purchaseInvoice.updateMany({ data: { status } });
            await db!.journalEntry.updateMany({ where: { referenceType: 'PURCHASE_INVOICE' }, data: { status: 'DRAFT' } });
        }
        await consume(db!, 10);
        const quantities = await sourceQuantities(db!);
        const data = await request(db!, '120');
        const result = await run(db!, () => postPurchasePriceCorrection(data, actor));
        expect(result.inventoryAmount.toFixed(2)).toBe('0.00');
        expect(result.varianceAmount.toFixed(2)).toBe('200.00');
        expect(await sourceQuantities(db!)).toBe(quantities);
        expect((await db!.inventory.findUniqueOrThrow({ where: inventoryKey })).averageCost?.toFixed(4)).toBe('100.0000');
        await balances(db!);
    });

    it('keeps INCLUDE VAT and discount valuation equivalent to original reception at the new price', async () => {
        const input = { productVariantId, quantity: 10, unitPrice: 111, discountPercent: 10, taxPercent: 11, dppOtherAmount: null, ppnMode: 'INCLUDE' as const };
        const totals = calculatePurchaseOrderTotals([input], 0);
        await db!.purchaseOrderItem.update({ where: { id: purchaseOrderItemId }, data: totals.itemsWithTotals[0] });
        await db!.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { totalAmount: totals.finalTotal, taxAmount: totals.totalTax, discountAmount: totals.totalDiscount } });
        await receive(db!);
        const result = await run(db!, async () => postPurchasePriceCorrection(await request(db!, '122.1'), actor));
        expect(result.receiptAmount.toFixed(2)).toBe('90.00');
        expect(result.billTotalDelta.toFixed(2)).toBe('99.90');
        expect(result.billTaxDelta.toFixed(2)).toBe('9.90');
        expect((await balances(db!)).get(accounts.clearing)?.toFixed(2)).toBe('0.00');
    });

    it.each(['paid', 'supplementary', 'maklon', 'stale', 'period'] as const)('rejects %s without mutations', async kind => {
        const receipt = await receive(db!);
        const data = await request(db!, '120');
        const codes = { paid: 'PURCHASE_PRICE_BILL_PROTECTED', supplementary: 'PURCHASE_PRICE_BILL_AMBIGUOUS', maklon: 'PURCHASE_PRICE_MAKLON', stale: 'PURCHASE_PRICE_SOURCE_CHANGED', period: 'FISCAL_PERIOD_CLOSED' };
        if (kind === 'paid') await db!.purchaseInvoice.update({ where: { id: data.invoiceId }, data: { status: 'PARTIAL', paidAmount: 10 } });
        if (kind === 'supplementary') await db!.purchaseInvoice.create({ data: { invoiceNumber: 'BILL-SYNTHETIC-EXTRA', purchaseOrderId, totalAmount: 1, status: 'DRAFT' } });
        if (kind === 'maklon') await db!.goodsReceipt.update({ where: { id: receipt.id }, data: { isMaklon: true } });
        if (kind === 'stale') await consume(db!, 1);
        if (kind === 'period') await db!.fiscalPeriod.updateMany({ data: { status: 'CLOSED' } });
        const before = await snapshot(db!);
        await expect(run(db!, () => postPurchasePriceCorrection(data, actor))).rejects.toMatchObject({ code: codes[kind] });
        expect(await snapshot(db!)).toBe(before);
    });

    it('serializes concurrent identical approvals to one correction and one revaluation journal', async () => {
        await receive(db!);
        const data = await request(db!, '120');
        const results = await Promise.all([
            run(db!, () => postPurchasePriceCorrection(data, actor)),
            run(db!, () => postPurchasePriceCorrection(data, actor)),
        ]);
        expect(results[0].id).toBe(results[1].id);
        expect(await db!.purchasePriceCorrection.count()).toBe(1);
        expect(await db!.journalEntry.count({ where: { reference: `PURCHASE_PRICE:${results[0].id}` } })).toBe(1);
        expect((await db!.inventory.findUniqueOrThrow({ where: inventoryKey })).averageCost?.toFixed(4)).toBe('120.0000');
    });

    it('fails atomically when the existing sync rejects a changed VAT ratio from flat shipping', async () => {
        await db!.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { shippingCost: 100, totalAmount: 1210 } });
        await receive(db!);
        const data = await request(db!, '120');
        const before = await snapshot(db!);
        await expect(run(db!, () => postPurchasePriceCorrection(data, actor))).rejects.toMatchObject({ code: 'PURCHASE_JOURNAL_MISMATCH' });
        expect(await snapshot(db!)).toBe(before);
    });

    it('rolls back PO, bill delta, WAC, journals and evidence on a late actor FK failure', async () => {
        await receive(db!);
        const data = await request(db!, '120');
        const before = await snapshot(db!);
        await expect(run(db!, () => postPurchasePriceCorrection(data, 'missing-synthetic-actor'))).rejects.toThrow();
        expect(await snapshot(db!)).toBe(before);
    });

    it('enforces immutable correction and journal history in PostgreSQL', async () => {
        await receive(db!);
        const data = await request(db!, '120');
        const result = await run(db!, () => postPurchasePriceCorrection(data, actor));
        const before = await snapshot(db!);
        await expect(db!.purchasePriceCorrection.update({ where: { id: result.id }, data: { reason: 'Perubahan tidak sah' } })).rejects.toThrow();
        await expect(db!.purchasePriceCorrection.delete({ where: { id: result.id } })).rejects.toThrow();
        await expect(db!.journalEntry.update({ where: { id: result.journalId }, data: { status: 'VOIDED' } })).rejects.toThrow();
        await expect(db!.journalLine.deleteMany({ where: { journalEntryId: result.journalId } })).rejects.toThrow();
        await expect(db!.journalLine.create({ data: { journalEntryId: result.journalId, accountId: accounts.cogs, debit: 1, credit: 0 } })).rejects.toThrow();
        expect(await snapshot(db!)).toBe(before);
    });
});
