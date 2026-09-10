import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { runWithActor } from '@/lib/core/actor-context';
import type { AccountRole } from '@/services/accounting/account-resolver';

const staticPrismaMock = vi.hoisted(() => ({
    current: null as PrismaClient | null,
}));

vi.mock('@/lib/core/prisma', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/core/prisma')>();
    const fixture = await import('./gr-valuation-postgres-fixture');
    return {
        ...actual,
        get prisma() {
            if (!staticPrismaMock.current) {
                staticPrismaMock.current =
                    fixture.requireGrValuationTestClient();
            }
            return staticPrismaMock.current;
        },
    };
});
vi.mock('@/services/accounting/account-resolver', async (importOriginal) => {
    const actual =
        await importOriginal<
            typeof import('@/services/accounting/account-resolver')
        >();
    const fixture = await import('./gr-valuation-postgres-fixture');
    return {
        ...actual,
        resolveAccount: vi.fn(async (role: AccountRole) => {
            if (role === 'gr-clearing') {
                return {
                    id: fixture.accounts.clearing.id,
                    code: fixture.accounts.clearing.code,
                    name: 'GR/IR clearing',
                };
            }
            if (role === 'vat-input') {
                return {
                    id: fixture.accounts.vat.id,
                    code: fixture.accounts.vat.code,
                    name: 'PPN Masukan GR',
                };
            }
            if (role === 'accounts-payable') {
                return {
                    id: fixture.accounts.payable.id,
                    code: fixture.accounts.payable.code,
                    name: 'Hutang Dagang GR',
                };
            }
            return actual.resolveAccount(role);
        }),
    };
});
vi.mock('@/services/core/notification-service', () => ({
    NotificationService: {
        createBulkNotifications: vi.fn().mockResolvedValue({ count: 0 }),
        createBulkNotificationsThrottled: vi
            .fn()
            .mockResolvedValue({ count: 0 }),
    },
}));

const enabled = !!process.env.GR_VALUATION_TEST_DATABASE_URL;

const lazy = {
    async load() {
        const { requireGrValuationTestClient } = await import(
            './gr-valuation-postgres-fixture'
        );
        if (!staticPrismaMock.current) {
            staticPrismaMock.current =
                requireGrValuationTestClient() as PrismaClient;
        }
        const fixture = await import('./gr-valuation-postgres-fixture');
        const receipts = await import('../receipts-service');
        return {
            db: staticPrismaMock.current as PrismaClient,
            ...fixture,
            ...receipts,
        };
    },
};

const actor = 'gr-valuation-actor';
const withActor = <T>(fn: () => Promise<T>) => runWithActor(actor, fn);

describe.skipIf(!enabled)('G1 second review probes', () => {
    beforeEach(async () => {
        const { db, seedGrValuationBaseline } = await lazy.load();
        await seedGrValuationBaseline(db);
    });
    afterAll(async () => {
        await staticPrismaMock.current?.$disconnect();
        staticPrismaMock.current = null;
    });


    async function receive(qty: number) {
        const { createGoodsReceipt } = await lazy.load();
        const { createGoodsReceiptSchema } = await import('@/lib/schemas/purchasing');
        const input = createGoodsReceiptSchema.parse({
            purchaseOrderId: 'gr-po', isMaklon: false, notes: 'review probe',
            receivedDate: new Date('2026-09-08T02:00:00Z'), locationId: 'gr-location',
            items: [{ purchaseOrderItemId: 'gr-po-item', productVariantId: 'gr-variant', receivedQty: qty }],
        });
        return withActor(() => createGoodsReceipt(input, actor));
    }

    async function clearing() {
        const { db, accounts } = await lazy.load();
        const { Prisma } = await import('@prisma/client');
        const sums = await Promise.all(['GOODS_RECEIPT', 'PURCHASE_INVOICE'].map(referenceType =>
            db.journalLine.aggregate({
                where: { accountId: accounts.clearing.id, journalEntry: { status: 'POSTED', referenceType: referenceType as 'GOODS_RECEIPT' | 'PURCHASE_INVOICE' } },
                _sum: { debit: true, credit: true },
            }),
        ));
        const net = sums.map(s => new Prisma.Decimal(s._sum.credit ?? 0).minus(s._sum.debit ?? 0));
        return { gr: net[0].toFixed(2), bill: net[1].negated().toFixed(2) };
    }
    it.each([
        { input: 1.00005, canonical: '1.0001', total: '10001.00' },
        { input: 1.00004, canonical: '1.0000', total: '10000.00' },
    ])('canonicalizes quantity $input consistently across receipt side effects', async ({ input, canonical, total }) => {
        const { db } = await lazy.load();
        await db.purchaseOrderItem.update({ where: { id: 'gr-po-item' }, data: {
            unitPrice: '10000', taxPercent: 0, ppnMode: 'EXCLUDE', taxAmount: 0, subtotal: '15000000',
        } });
        await db.purchaseOrder.update({ where: { id: 'gr-po' }, data: { totalAmount: '15000000', taxAmount: 0 } });
        const gr = await receive(input);
        const row = await db.goodsReceiptItem.findFirstOrThrow({ where: { goodsReceiptId: gr.id } });
        const movement = await db.stockMovement.findFirstOrThrow({ where: { goodsReceiptId: gr.id } });
        const inventory = await db.inventory.findUniqueOrThrow({
            where: { locationId_productVariantId: { locationId: 'gr-location', productVariantId: 'gr-variant' } },
        });
        const poItem = await db.purchaseOrderItem.findUniqueOrThrow({ where: { id: 'gr-po-item' } });
        const balance = await clearing();
        expect(row.receivedQty.toFixed(4)).toBe(canonical);
        expect(movement.quantity.toFixed(4)).toBe(canonical);
        expect(inventory.quantity.toFixed(4)).toBe(canonical);
        expect(poItem.receivedQty.toFixed(4)).toBe(canonical);
        expect(balance).toEqual({ gr: total, bill: total });
    });
    it('rejects a positive quantity that rounds to zero at DB precision', async () => {
        const { createGoodsReceiptSchema } = await import('@/lib/schemas/purchasing');
        expect(() => createGoodsReceiptSchema.parse({
            purchaseOrderId: 'gr-po', isMaklon: false,
            receivedDate: new Date('2026-09-08T02:00:00Z'), locationId: 'gr-location',
            items: [{ purchaseOrderItemId: 'gr-po-item', productVariantId: 'gr-variant', receivedQty: 0.00004 }],
        })).toThrow(/0\.0001/);
    });
    it.each([0, 1, 2])('preserves clearing when partial receipt index %i is reversed', async (reversalIndex) => {
        const { db, reverseGoodsReceipt } = await lazy.load();
        await db.purchaseOrderItem.update({ where: { id: 'gr-po-item' }, data: {
            quantity: 6, unitPrice: '0.05', discountPercent: 10, taxPercent: 0,
            ppnMode: 'EXCLUDE', subtotal: '0.27', taxAmount: 0,
        } });
        await db.purchaseOrder.update({ where: { id: 'gr-po' }, data: { totalAmount: '0.27', taxAmount: 0 } });
        const receipts = [await receive(1), await receive(2), await receive(3)];
        const before = await clearing();
        expect(before).toEqual({ gr: '0.27', bill: '0.27' });
        await withActor(() => reverseGoodsReceipt(receipts[reversalIndex].id, actor));
        const after = await clearing();
        expect(after.gr).toBe(after.bill);
    });
    it('keeps clearing exact across a receive/reverse cycle', async () => {
        const { db, reverseGoodsReceipt } = await lazy.load();
        await db.purchaseOrderItem.update({ where: { id: 'gr-po-item' }, data: {
            quantity: 6, unitPrice: '0.05', discountPercent: 10, taxPercent: 0,
            ppnMode: 'EXCLUDE', subtotal: '0.27', taxAmount: 0,
        } });
        await db.purchaseOrder.update({ where: { id: 'gr-po' }, data: { totalAmount: '0.27', taxAmount: 0 } });
        const first = await receive(1);
        await receive(2);
        await receive(3);
        await withActor(() => reverseGoodsReceipt(first.id, actor));
        const replacement = await receive(1);
        expect(await clearing()).toEqual({ gr: '0.27', bill: '0.27' });
        await withActor(() => reverseGoodsReceipt(replacement.id, actor));
        expect(await clearing()).toEqual({ gr: '0.23', bill: '0.23' });
    });
    it('rolls back reversal and its rounding adjustment when the bill is protected', async () => {
        const { db, reverseGoodsReceipt } = await lazy.load();
        await db.purchaseOrderItem.update({ where: { id: 'gr-po-item' }, data: {
            quantity: 6, unitPrice: '0.05', discountPercent: 10, taxPercent: 0,
            ppnMode: 'EXCLUDE', subtotal: '0.27', taxAmount: 0,
        } });
        await db.purchaseOrder.update({ where: { id: 'gr-po' }, data: { totalAmount: '0.27', taxAmount: 0 } });
        const first = await receive(1);
        await receive(2);
        await receive(3);
        const invoice = await db.purchaseInvoice.findFirstOrThrow({ where: { purchaseOrderId: 'gr-po' } });
        await db.purchaseInvoice.update({ where: { id: invoice.id }, data: { status: 'PAID', paidAmount: invoice.totalAmount } });
        const before = {
            receipts: await db.goodsReceipt.count(), movements: await db.stockMovement.count(),
            journals: await db.journalEntry.count(), inventory: (await db.inventory.findFirstOrThrow()).quantity.toFixed(4),
            clearing: await clearing(),
        };
        await expect(withActor(() => reverseGoodsReceipt(first.id, actor))).rejects.toMatchObject({ code: 'PURCHASE_BILL_PROTECTED' });
        const after = {
            receipts: await db.goodsReceipt.count(), movements: await db.stockMovement.count(),
            journals: await db.journalEntry.count(), inventory: (await db.inventory.findFirstOrThrow()).quantity.toFixed(4),
            clearing: await clearing(),
        };
        expect(after).toEqual(before);
    });
    it('serializes concurrent movement replays before checking idempotency', async () => {
        const { db } = await lazy.load();
        await db.purchaseOrderItem.update({ where: { id: 'gr-po-item' }, data: {
            unitPrice: '10000', subtotal: '15000000', taxAmount: '1486486.49',
        } });
        await db.purchaseOrder.update({ where: { id: 'gr-po' }, data: { totalAmount: '15000000', taxAmount: '1486486.49' } });
        const receipt = await receive(1500);
        const movement = await db.stockMovement.findFirstOrThrow({ where: { goodsReceiptId: receipt.id } });
        const journal = await db.journalEntry.findFirstOrThrow({ where: {
            referenceType: 'GOODS_RECEIPT', referenceId: movement.id, status: 'POSTED',
        } });
        await db.journalLine.deleteMany({ where: { journalEntryId: journal.id } });
        await db.journalEntry.delete({ where: { id: journal.id } });

        const { recordInventoryMovement } = await import('@/services/accounting/inventory-link-service');
        await Promise.all([
            withActor(() => recordInventoryMovement(movement)),
            withActor(() => recordInventoryMovement(movement)),
        ]);

        expect(await db.journalEntry.count({ where: {
            referenceType: 'GOODS_RECEIPT', referenceId: movement.id, status: 'POSTED',
        } })).toBe(1);
    });
    it('keeps the bulk journal amount deterministic on movement replay', async () => {
        const { db, accounts } = await lazy.load();
        await db.purchaseOrderItem.update({ where: { id: 'gr-po-item' }, data: {
            unitPrice: '10000', subtotal: '15000000', taxAmount: '1486486.49',
        } });
        await db.purchaseOrder.update({ where: { id: 'gr-po' }, data: { totalAmount: '15000000', taxAmount: '1486486.49' } });
        const receipt = await receive(1500);
        const movement = await db.stockMovement.findFirstOrThrow({ where: { goodsReceiptId: receipt.id } });
        const { recordInventoryMovement } = await import('@/services/accounting/inventory-link-service');
        const before = {
            journals: await db.journalEntry.count(),
            costs: await db.costHistory.count(),
            standardCost: (await db.productVariant.findUniqueOrThrow({ where: { id: 'gr-variant' } })).standardCost?.toFixed(4),
        };
        await withActor(() => recordInventoryMovement(movement, db));
        const after = {
            journals: await db.journalEntry.count(),
            costs: await db.costHistory.count(),
            standardCost: (await db.productVariant.findUniqueOrThrow({ where: { id: 'gr-variant' } })).standardCost?.toFixed(4),
        };
        const lines = await db.journalLine.findMany({ where: {
            accountId: accounts.clearing.id,
            journalEntry: { referenceType: 'GOODS_RECEIPT', referenceId: movement.id, status: 'POSTED' },
        } });
        expect(lines.map(l => l.credit.toFixed(2))).toEqual(['13513513.51']);
        expect(after).toEqual(before);
    });
});
