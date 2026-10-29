import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MovementType, Prisma, type PrismaClient } from '@prisma/client';
import { tenantContext } from '@/lib/core/prisma';
import { runWithActor } from '@/lib/core/actor-context';
import { getWibMonthBounds, toBusinessDateString } from '@/lib/utils/timezone';
import { InventoryCoreService } from '@/services/inventory/core-service';
import {
    returnTestClient,
    verifyReturnTestDatabase,
} from '../../finance/__tests__/return-credit-postgres-fixture';
import {
    createGoodsReceipt,
    reverseAllGoodsReceiptsForPO,
    reverseGoodsReceipt,
} from '../receipts-service';

const url = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = url ? returnTestClient(url) : null;
const actor = 'gr-guard-actor';
const locationId = 'gr-guard-location';
const productVariantId = 'gr-guard-variant';
const purchaseOrderId = 'gr-guard-po';
const purchaseOrderItemId = 'gr-guard-po-item';
const receiptQuantity = new Prisma.Decimal('12.3456');
const accounts = {
    inventory: randomUUID(),
    clearing: randomUUID(),
    vat: randomUUID(),
    payable: randomUUID(),
};
const inventoryKey = { locationId_productVariantId: { locationId, productVariantId } };
const run = <T>(client: PrismaClient, callback: () => Promise<T>) =>
    tenantContext.run(client, () => runWithActor(actor, callback));

async function seed(client: PrismaClient) {
    await verifyReturnTestDatabase(client);
    await client.$executeRaw`TRUNCATE "Product", "Location", "User", "Account", "Supplier", "FiscalPeriod", "SystemSequence", "AuditLog" CASCADE`;
    await client.user.create({
        data: {
            id: actor,
            email: 'gr-guard@example.invalid',
            password: 'synthetic-only',
            role: 'WAREHOUSE',
        },
    });
    await client.account.createMany({
        data: [
            { id: accounts.inventory, code: '11310', name: 'Synthetic raw inventory', type: 'ASSET', category: 'CURRENT_ASSET' },
            { id: accounts.clearing, code: '21140', name: 'Synthetic GR/IR clearing', type: 'LIABILITY', category: 'CURRENT_LIABILITY' },
            { id: accounts.vat, code: '21320', name: 'Synthetic VAT input', type: 'ASSET', category: 'CURRENT_ASSET' },
            { id: accounts.payable, code: '21110', name: 'Synthetic trade payable', type: 'LIABILITY', category: 'CURRENT_LIABILITY' },
        ],
    });
    await client.location.create({
        data: { id: locationId, name: 'Gudang Sintetis GR', slug: 'gr-guard-location' },
    });
    await client.product.create({
        data: {
            id: 'gr-guard-product',
            name: 'Synthetic GR material',
            productType: 'RAW_MATERIAL',
            inventoryAccountId: accounts.inventory,
        },
    });
    await client.productVariant.create({
        data: {
            id: productVariantId,
            productId: 'gr-guard-product',
            name: 'Synthetic GR variant',
            skuCode: 'SYNTHETIC-GR-GUARD',
            primaryUnit: 'KG',
        },
    });
    await client.supplier.create({
        data: { id: 'gr-guard-supplier', name: 'Synthetic GR supplier' },
    });
    await client.purchaseOrder.create({
        data: {
            id: purchaseOrderId,
            orderNumber: 'PO-SYNTHETIC-GUARD',
            supplierId: 'gr-guard-supplier',
            status: 'SENT',
            totalAmount: '12345.60',
            taxAmount: 0,
            items: {
                create: {
                    id: purchaseOrderItemId,
                    productVariantId,
                    quantity: receiptQuantity,
                    receivedQty: 0,
                    unitPrice: 1000,
                    subtotal: '12345.60',
                    discountPercent: 0,
                    taxPercent: 0,
                    taxAmount: 0,
                    ppnMode: 'EXCLUDE',
                },
            },
        },
    });
    const [year, month] = toBusinessDateString(new Date()).split('-').map(Number);
    const bounds = getWibMonthBounds(year, month);
    await client.fiscalPeriod.create({
        data: {
            name: 'Synthetic current period',
            year,
            month,
            startDate: bounds.start,
            endDate: bounds.end,
            status: 'OPEN',
        },
    });
    await client.systemSequence.create({
        data: { key: `JOURNAL_ENTRY_${year}`, value: 100 },
    });
}

async function receive(client: PrismaClient, quantities = [12.3456]) {
    return run(client, () => createGoodsReceipt({
        purchaseOrderId,
        locationId,
        receivedDate: new Date(),
        isMaklon: false,
        notes: 'Synthetic guard receipt',
        items: quantities.map(receivedQty => ({ purchaseOrderItemId, productVariantId, receivedQty })),
    }, actor));
}

async function consume(client: PrismaClient, quantity: number) {
    await run(client, () => client.$transaction(async tx => {
        await InventoryCoreService.validateAndLockStock(tx, locationId, productVariantId, quantity);
        await InventoryCoreService.deductStock(tx, locationId, productVariantId, quantity);
        await tx.stockMovement.create({
            data: {
                type: MovementType.OUT,
                productVariantId,
                fromLocationId: locationId,
                quantity: new Prisma.Decimal(quantity),
                cost: 1000,
                reference: 'Synthetic material consumption',
                createdById: actor,
            },
        });
    }));
}

async function snapshot(client: PrismaClient) {
    return JSON.stringify(await Promise.all([
        client.inventory.findMany({ orderBy: { id: 'asc' } }),
        client.stockMovement.findMany({ orderBy: { id: 'asc' } }),
        client.journalEntry.findMany({ orderBy: { id: 'asc' }, include: { lines: { orderBy: { id: 'asc' } } } }),
        client.goodsReceipt.findMany({ orderBy: { id: 'asc' }, include: { items: { orderBy: { id: 'asc' } } } }),
        client.purchaseOrderItem.findMany({ orderBy: { id: 'asc' } }),
        client.purchaseOrder.findMany({ orderBy: { id: 'asc' } }),
        client.purchaseInvoice.findMany({ orderBy: { id: 'asc' } }),
        client.costHistory.findMany({ orderBy: { id: 'asc' } }),
        client.auditLog.findMany({ orderBy: { id: 'asc' } }),
    ]));
}

async function ledgerQuantity(client: PrismaClient) {
    const [inbound, outbound] = await Promise.all([
        client.stockMovement.aggregate({ where: { productVariantId, toLocationId: locationId }, _sum: { quantity: true } }),
        client.stockMovement.aggregate({ where: { productVariantId, fromLocationId: locationId }, _sum: { quantity: true } }),
    ]);
    return (inbound._sum.quantity ?? new Prisma.Decimal(0)).minus(outbound._sum.quantity ?? 0);
}

async function assertReceiptEvidence(client: PrismaClient, goodsReceiptId: string, movementCount = 1) {
    const movements = await client.stockMovement.findMany({ where: { goodsReceiptId } });
    expect(movements).toHaveLength(movementCount);
    expect(movements.reduce((sum, movement) => sum.plus(movement.quantity), new Prisma.Decimal(0)).equals(receiptQuantity)).toBe(true);
    expect(await client.journalEntry.count({
        where: { referenceType: 'GOODS_RECEIPT', referenceId: { in: movements.map(movement => movement.id) }, status: 'POSTED' },
    })).toBe(movementCount);
    expect((await client.purchaseOrderItem.findUniqueOrThrow({ where: { id: purchaseOrderItemId } })).receivedQty.toFixed(4)).toBe('12.3456');
    expect(await client.purchaseInvoice.count({ where: { purchaseOrderId } })).toBe(1);
}

describe.skipIf(!db)('GR reversal consumed-stock PostgreSQL contract', () => {
    beforeEach(async () => seed(db!));
    afterAll(async () => { await db?.$disconnect(); });

    it.each([0.0001, 2.3456])('rejects reversal after consuming %s and preserves all receipt evidence', async quantity => {
        const receipt = await receive(db!);
        await assertReceiptEvidence(db!, receipt.id);
        await consume(db!, quantity);
        const available = receiptQuantity.minus(quantity);
        expect((await db!.inventory.findUniqueOrThrow({ where: inventoryKey })).quantity.equals(available)).toBe(true);
        expect((await ledgerQuantity(db!)).equals(available)).toBe(true);
        const before = await snapshot(db!);

        await expect(run(db!, () => reverseGoodsReceipt(receipt.id, actor))).rejects.toMatchObject({
            code: 'GR_REVERSAL_STOCK_CONSUMED',
            details: { goodsReceiptId: receipt.id, productVariantId, locationId, available: available.toString(), required: '12.3456' },
        });
        expect(await snapshot(db!)).toBe(before);
    });

    it('rejects a missing inventory row without removing the receipt or its evidence', async () => {
        const receipt = await receive(db!);
        await assertReceiptEvidence(db!, receipt.id);
        await db!.inventory.delete({ where: inventoryKey });
        const before = await snapshot(db!);

        await expect(run(db!, () => reverseGoodsReceipt(receipt.id, actor))).rejects.toMatchObject({
            code: 'GR_REVERSAL_STOCK_CONSUMED',
            details: { available: '0', required: '12.3456' },
        });
        expect(await snapshot(db!)).toBe(before);
    });

    it.each(['0', '3.2109'])('reverses an intact four-decimal receipt exactly, preserving opening stock %s and ledger equality', async opening => {
        if (opening !== '0') {
            await db!.inventory.create({ data: { locationId, productVariantId, quantity: opening, averageCost: 1000 } });
            await db!.stockMovement.create({
                data: { type: MovementType.PURCHASE, productVariantId, toLocationId: locationId, quantity: opening, cost: 1000, reference: 'Synthetic opening stock', createdById: actor },
            });
        }
        const receipt = await receive(db!);
        await assertReceiptEvidence(db!, receipt.id);
        const before = (await db!.inventory.findUniqueOrThrow({ where: inventoryKey })).quantity;
        const beforeLedger = await ledgerQuantity(db!);
        expect(before.equals(receiptQuantity.plus(opening))).toBe(true);
        expect(beforeLedger.equals(before)).toBe(true);
        const movements = await db!.stockMovement.findMany({ where: { goodsReceiptId: receipt.id } });
        expect(movements[0].quantity.toFixed(4)).toBe('12.3456');

        await expect(run(db!, () => reverseGoodsReceipt(receipt.id, actor))).resolves.toMatchObject({ success: true });

        const after = (await db!.inventory.findUniqueOrThrow({ where: inventoryKey })).quantity;
        const afterLedger = await ledgerQuantity(db!);
        expect(after.toFixed(4)).toBe(new Prisma.Decimal(opening).toFixed(4));
        expect(after.equals(afterLedger)).toBe(true);
        expect(before.minus(after).toFixed(4)).toBe('12.3456');
        expect(beforeLedger.minus(afterLedger).toFixed(4)).toBe('12.3456');
        expect(await db!.goodsReceipt.findUnique({ where: { id: receipt.id } })).toBeNull();
        expect(await db!.stockMovement.count({ where: { goodsReceiptId: receipt.id } })).toBe(0);
        expect(await db!.journalEntry.count({ where: { referenceId: { in: movements.map(movement => movement.id) } } })).toBe(0);
        expect((await db!.purchaseOrderItem.findUniqueOrThrow({ where: { id: purchaseOrderItemId } })).receivedQty.toFixed(4)).toBe('0.0000');
        expect((await db!.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId } })).status).toBe('SENT');
    });

    it('rolls back the first decrement and evidence deletion when the second same-pair movement fails', async () => {
        const receipt = await receive(db!, [6.1728, 6.1728]);
        await assertReceiptEvidence(db!, receipt.id, 2);
        await consume(db!, 6.1728);
        const before = await snapshot(db!);

        await expect(run(db!, () => reverseGoodsReceipt(receipt.id, actor))).rejects.toMatchObject({
            code: 'GR_REVERSAL_STOCK_CONSUMED',
            details: { available: '0', required: '6.1728' },
        });
        expect(await snapshot(db!)).toBe(before);
    });

    it('propagates through reverseAll and rolls back earlier invoice-journal deletions in the caller transaction', async () => {
        const receipt = await receive(db!);
        await assertReceiptEvidence(db!, receipt.id);
        await consume(db!, 2.3456);
        const invoice = await db!.purchaseInvoice.findFirstOrThrow({ where: { purchaseOrderId } });
        expect(await db!.journalEntry.count({ where: { referenceId: invoice.id, referenceType: 'PURCHASE_INVOICE' } })).toBeGreaterThan(0);
        const before = await snapshot(db!);

        await expect(run(db!, () => db!.$transaction(async tx => {
            await tx.journalLine.deleteMany({ where: { journalEntry: { referenceId: invoice.id, referenceType: 'PURCHASE_INVOICE' } } });
            await tx.journalEntry.deleteMany({ where: { referenceId: invoice.id, referenceType: 'PURCHASE_INVOICE' } });
            await reverseAllGoodsReceiptsForPO(purchaseOrderId, actor, tx);
            await tx.purchaseInvoice.delete({ where: { id: invoice.id } });
        }))).rejects.toMatchObject({ code: 'GR_REVERSAL_STOCK_CONSUMED' });
        expect(await snapshot(db!)).toBe(before);
    });
});
