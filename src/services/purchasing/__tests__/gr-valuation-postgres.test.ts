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

describe.skipIf(!enabled)('GR net valuation on isolated PostgreSQL', () => {
    beforeEach(async () => {
        const { db, seedGrValuationBaseline } = await lazy.load();
        await seedGrValuationBaseline(db);
    });
    afterAll(async () => {
        await staticPrismaMock.current?.$disconnect();
        staticPrismaMock.current = null;
    });

    it('posts one net cost through GR roundtrip and invoice journal', async () => {
        const { db, seedGrValuationBaseline, syntheticCase, accounts } =
            await lazy.load();
        const { receivedDate } = await seedGrValuationBaseline(db);
        await withActor(() =>
            lazy.load().then(({ createGoodsReceipt }) =>
                createGoodsReceipt(
                    {
                        purchaseOrderId: 'gr-po',
                        isMaklon: false,
                        notes: 'GR valuation fixture',
                        receivedDate,
                        locationId: 'gr-location',
                        items: [
                            {
                                purchaseOrderItemId: 'gr-po-item',
                                productVariantId: 'gr-variant',
                                receivedQty: 1500,
                            },
                        ],
                    },
                    actor,
                ),
            ),
        );

        const grItem = await db.goodsReceiptItem.findFirstOrThrow({
            where: { purchaseOrderItemId: 'gr-po-item' },
        });
        expect(grItem.unitCost.toFixed(4)).toBe('26800.0000');

        const movement = await db.stockMovement.findFirstOrThrow({
            where: { goodsReceipt: { purchaseOrderId: 'gr-po' } },
        });
        expect(movement.cost?.toFixed(4)).toBe('26800.0000');

        const inventory = await db.inventory.findFirstOrThrow({
            where: {
                locationId: 'gr-location',
                productVariantId: 'gr-variant',
            },
        });
        expect(inventory.quantity.toFixed(4)).toBe('1500.0000');
        expect(inventory.averageCost?.toFixed(4)).toBe('26800.0000');

        const variant = await db.productVariant.findUniqueOrThrow({
            where: { id: 'gr-variant' },
        });
        expect(variant.standardCost?.toFixed(4)).toBe('26800.0000');

        const grJournal = await db.journalEntry.findFirstOrThrow({
            where: {
                referenceType: 'GOODS_RECEIPT',
                referenceId: movement.id,
            },
            include: { lines: { orderBy: { id: 'asc' } } },
        });
        expect(grJournal.status).toBe('POSTED');
        const grDebit = grJournal.lines.find(
            (line) => line.accountId === accounts.inventory.id,
        );
        const grCredit = grJournal.lines.find(
            (line) => line.accountId === accounts.clearing.id,
        );
        expect(grDebit?.debit.toFixed(2)).toBe('40200000.00');
        expect(grCredit?.credit.toFixed(2)).toBe('40200000.00');

        const invoice = await db.purchaseInvoice.findFirstOrThrow({
            where: { purchaseOrderId: 'gr-po' },
        });
        expect(invoice.totalAmount.toFixed(2)).toBe('44622000.00');

        const invoiceJournal = await db.journalEntry.findFirstOrThrow({
            where: {
                referenceType: 'PURCHASE_INVOICE',
                referenceId: invoice.id,
            },
            include: { lines: true },
        });
        const clearingDebit = invoiceJournal.lines
            .filter((line) => line.accountId === accounts.clearing.id)
            .reduce((sum, line) => sum + Number(line.debit), 0);
        const vatDebit = invoiceJournal.lines
            .filter((line) => line.accountId === accounts.vat.id)
            .reduce((sum, line) => sum + Number(line.debit), 0);
        const apCredit = invoiceJournal.lines
            .filter((line) => line.accountId === accounts.payable.id)
            .reduce((sum, line) => sum + Number(line.credit), 0);
        expect(clearingDebit).toBeGreaterThan(0);
        expect(vatDebit).toBeCloseTo(Number(syntheticCase.invoiceVat), 2);
        expect(apCredit).toBeCloseTo(Number(syntheticCase.invoiceTotal), 2);
        expect(clearingDebit + vatDebit).toBeCloseTo(apCredit, 2);

        const clearing = await db.journalLine.aggregate({
            where: {
                accountId: accounts.clearing.id,
                journalEntry: { status: 'POSTED' },
            },
            _sum: { debit: true, credit: true },
        });
        const netClearing =
            Number(clearing._sum.credit ?? 0) -
            Number(clearing._sum.debit ?? 0);
        expect(Math.abs(netClearing)).toBeLessThan(0.005);
    });

    it('accumulates partial receipts with cent-safe rounding', async () => {
        const { db, seedGrValuationBaseline } = await lazy.load();
        const { receivedDate } = await seedGrValuationBaseline(db);
        const { createGoodsReceipt } = await import('../receipts-service');
        await withActor(() =>
            createGoodsReceipt(
                {
                    purchaseOrderId: 'gr-po',
                    isMaklon: false,
                    notes: 'GR valuation fixture',
                    receivedDate,
                    locationId: 'gr-location',
                    items: [
                        {
                            purchaseOrderItemId: 'gr-po-item',
                            productVariantId: 'gr-variant',
                            receivedQty: 1000,
                        },
                    ],
                },
                actor,
            ),
        );
        await withActor(() =>
            createGoodsReceipt(
                {
                    purchaseOrderId: 'gr-po',
                    isMaklon: false,
                    notes: 'GR valuation fixture',
                    receivedDate,
                    locationId: 'gr-location',
                    items: [
                        {
                            purchaseOrderItemId: 'gr-po-item',
                            productVariantId: 'gr-variant',
                            receivedQty: 500,
                        },
                    ],
                },
                actor,
            ),
        );

        const poItem = await db.purchaseOrderItem.findUniqueOrThrow({
            where: { id: 'gr-po-item' },
        });
        expect(poItem.receivedQty.toFixed(4)).toBe('1500.0000');
        const items = await db.goodsReceiptItem.findMany({
            where: { purchaseOrderItemId: 'gr-po-item' },
            orderBy: { receivedQty: 'asc' },
        });
        expect(items).toHaveLength(2);
        for (const item of items) {
            expect(item.unitCost.toFixed(4)).toBe('26800.0000');
        }
        const inventory = await db.inventory.findFirstOrThrow({
            where: {
                locationId: 'gr-location',
                productVariantId: 'gr-variant',
            },
        });
        expect(inventory.quantity.toFixed(4)).toBe('1500.0000');
        expect(inventory.averageCost?.toFixed(4)).toBe('26800.0000');
    });

    it('keeps fractional INCLUDE unit rounding exact across repeated partials', async () => {
        const { db, seedGrValuationBaseline, accounts } = await lazy.load();
        const { receivedDate } = await seedGrValuationBaseline(db);
        const { createGoodsReceipt } = await import('../receipts-service');
        await db.purchaseOrderItem.create({
            data: {
                id: 'gr-po-fraction',
                purchaseOrderId: 'gr-po',
                productVariantId: 'gr-variant-b',
                quantity: 6,
                unitPrice: '0.05',
                subtotal: '0.30',
                discountPercent: 0,
                taxPercent: 11,
                taxAmount: 0,
                ppnMode: 'INCLUDE',
                receivedQty: 0,
            },
        });
        const unitCosts: string[] = [];
        const receiptQtys = [1, 2, 3];
        const receiptDates = [0, 6, 12].map(
            (minutes) =>
                new Date(receivedDate.getTime() + minutes * 60 * 1000),
        );
        for (let index = 0; index < 3; index += 1) {
            await withActor(() =>
                createGoodsReceipt(
                    {
                        purchaseOrderId: 'gr-po',
                        isMaklon: false,
                        notes: 'GR valuation fixture',
                        receivedDate: receiptDates[index],
                        locationId: 'gr-location-b',
                        items: [
                            {
                                purchaseOrderItemId: 'gr-po-fraction',
                                productVariantId: 'gr-variant-b',
                                receivedQty: receiptQtys[index],
                            },
                        ],
                    },
                    actor,
                ),
            );
            const latest = await db.goodsReceiptItem.findFirstOrThrow({
                where: { purchaseOrderItemId: 'gr-po-fraction' },
                orderBy: { id: 'desc' },
            });
            unitCosts.push(latest.unitCost.toFixed(4));
        }
        expect(unitCosts).toEqual(['0.0450', '0.0450', '0.0450']);
        const movements = await db.stockMovement.findMany({
            where: {
                productVariantId: 'gr-variant-b',
                goodsReceipt: { purchaseOrderId: 'gr-po' },
            },
            orderBy: { quantity: 'asc' },
        });
        expect(movements).toHaveLength(3);
        expect(movements.map((movement) => Number(movement.quantity))).toEqual([
            1, 2, 3,
        ]);
        for (const movement of movements) {
            expect(movement.cost?.toFixed(4)).toBe('0.0450');
        }
        const fractionJournals = await db.journalEntry.findMany({
            where: {
                referenceType: 'GOODS_RECEIPT',
                referenceId: { in: movements.map((movement) => movement.id) },
            },
            include: { lines: true },
        });
        expect(fractionJournals).toHaveLength(3);
        const journalByMovement = new Map(
            fractionJournals.map((journal) => [journal.referenceId, journal]),
        );
        // Telescoping residual allocation: posted journals must sum to the
        // invoice aggregate (27), not to naive round2-per-line sums (28).
        const expectedLineTotals = ['0.05', '0.09', '0.13'];
        let postedInventoryCents = 0;
        let postedClearingCents = 0;
        movements.forEach((movement, index) => {
            const journal = journalByMovement.get(movement.id);
            expect(journal?.status).toBe('POSTED');
            const debit = journal?.lines.find(
                (line) => line.accountId === accounts.inventory.id,
            );
            const credit = journal?.lines.find(
                (line) => line.accountId === accounts.clearing.id,
            );
            expect(debit?.debit.toFixed(2)).toBe(expectedLineTotals[index]);
            expect(credit?.credit.toFixed(2)).toBe(expectedLineTotals[index]);
            postedInventoryCents += Math.round(Number(debit?.debit ?? 0) * 100);
            postedClearingCents += Math.round(Number(credit?.credit ?? 0) * 100);
        });
        expect(postedInventoryCents).toBe(27);
        expect(postedClearingCents).toBe(27);
        const persistedLineCents = movements.map((movement) =>
            Math.round(
                Number(movement.cost ?? 0) * Number(movement.quantity) * 100,
            ),
        );
        expect(persistedLineCents).toEqual([5, 9, 14]);
        // Persisted movement cost stays exact per unit (Decimal 15,4); only
        // the posted cent journals telescope, so their sum (27) intentionally
        // differs from the naive persisted-cents sum (28) by the residual.
        const invoice = await db.purchaseInvoice.findFirstOrThrow({
            where: { purchaseOrderId: 'gr-po' },
        });
        const invoiceJournals = await db.journalEntry.findMany({
            where: {
                referenceType: 'PURCHASE_INVOICE',
                referenceId: invoice.id,
            },
            include: { lines: true },
        });
        expect(invoiceJournals.length).toBeGreaterThan(0);
        let invoiceClearingCents = 0;
        for (const journal of invoiceJournals) {
            for (const line of journal.lines) {
                if (line.accountId === accounts.clearing.id) {
                    invoiceClearingCents +=
                        Math.round(Number(line.debit) * 100) -
                        Math.round(Number(line.credit) * 100);
                }
            }
        }
        expect(invoiceClearingCents).toBe(postedClearingCents);
    });

    it('keeps distinct PO-item costs for repeated SKU rows', async () => {
        const { db, seedGrValuationBaseline, accounts } = await lazy.load();
        const { receivedDate } = await seedGrValuationBaseline(db);
        const { createGoodsReceipt } = await import('../receipts-service');
        await db.purchaseOrderItem.create({
            data: {
                id: 'gr-po-item-b',
                purchaseOrderId: 'gr-po',
                productVariantId: 'gr-variant',
                quantity: 10,
                unitPrice: '20000',
                subtotal: '200000',
                discountPercent: 0,
                taxPercent: 11,
                taxAmount: 0,
                ppnMode: 'EXCLUDE',
                receivedQty: 0,
            },
        });
        await withActor(() =>
            createGoodsReceipt(
                {
                    purchaseOrderId: 'gr-po',
                    isMaklon: false,
                    notes: 'GR valuation fixture',
                    receivedDate,
                    locationId: 'gr-location',
                    items: [
                        {
                            purchaseOrderItemId: 'gr-po-item',
                            productVariantId: 'gr-variant',
                            receivedQty: 5,
                        },
                        {
                            purchaseOrderItemId: 'gr-po-item-b',
                            productVariantId: 'gr-variant',
                            receivedQty: 7,
                        },
                    ],
                },
                actor,
            ),
        );

        const byLine = await db.goodsReceiptItem.findMany({
            where: { purchaseOrderItemId: { in: ['gr-po-item', 'gr-po-item-b'] } },
            orderBy: { purchaseOrderItemId: 'asc' },
        });
        expect(byLine).toHaveLength(2);
        expect(byLine[0].unitCost.toFixed(4)).toBe('26800.0000');
        expect(byLine[1].unitCost.toFixed(4)).toBe('20000.0000');
        const movements = await db.stockMovement.findMany({
            where: { productVariantId: 'gr-variant' },
            orderBy: { quantity: 'asc' },
        });
        expect(
            movements.map((movement) => movement.cost?.toFixed(4)).sort(),
        ).toEqual(['20000.0000', '26800.0000']);
        const grNetByLine = byLine.reduce(
            (sum, item) =>
                sum + Number(item.unitCost) * Number(item.receivedQty),
            0,
        );
        expect(grNetByLine).toBe(274000);
        const grJournals = await db.journalEntry.findMany({
            where: {
                referenceType: 'GOODS_RECEIPT',
                referenceId: { in: movements.map((movement) => movement.id) },
            },
            include: { lines: true },
        });
        expect(grJournals).toHaveLength(2);
        let repeatedInventoryCents = 0;
        let repeatedClearingCents = 0;
        for (const journal of grJournals) {
            for (const line of journal.lines) {
                if (line.accountId === accounts.inventory.id) {
                    repeatedInventoryCents += Math.round(Number(line.debit) * 100);
                }
                if (line.accountId === accounts.clearing.id) {
                    repeatedClearingCents += Math.round(Number(line.credit) * 100);
                }
            }
        }
        expect(repeatedInventoryCents).toBe(27400000);
        expect(repeatedClearingCents).toBe(27400000);
        const invoice = await db.purchaseInvoice.findFirstOrThrow({
            where: { purchaseOrderId: 'gr-po' },
        });
        expect(Number(invoice.totalAmount)).toBe(304140);
    });

    it('uses stored movement cost after the PO price changes', async () => {
        const { db, seedGrValuationBaseline, syntheticCase } =
            await lazy.load();
        const { receivedDate } = await seedGrValuationBaseline(db);
        const { createGoodsReceipt } = await import('../receipts-service');
        await withActor(() =>
            createGoodsReceipt(
                {
                    purchaseOrderId: 'gr-po',
                    isMaklon: false,
                    notes: 'GR valuation fixture',
                    receivedDate,
                    locationId: 'gr-location',
                    items: [
                        {
                            purchaseOrderItemId: 'gr-po-item',
                            productVariantId: 'gr-variant',
                            receivedQty: 1500,
                        },
                    ],
                },
                actor,
            ),
        );
        await db.purchaseOrderItem.update({
            where: { id: 'gr-po-item' },
            data: { unitPrice: '35000' },
        });

        const movement = await db.stockMovement.findFirstOrThrow({
            where: { goodsReceipt: { purchaseOrderId: 'gr-po' } },
        });
        const journalCount = await db.journalEntry.count();
        const { recordInventoryMovement } = await import(
            '@/services/accounting/inventory-link-service'
        );
        await withActor(() => recordInventoryMovement(movement, db));

        const refreshed = await db.stockMovement.findUniqueOrThrow({
            where: { id: movement.id },
        });
        expect(refreshed.cost?.toFixed(4)).toBe('26800.0000');
        const journals = await db.journalEntry.findMany({
            where: {
                referenceType: 'GOODS_RECEIPT',
                referenceId: movement.id,
            },
            include: { lines: true },
        });
        expect(journals.length).toBeGreaterThanOrEqual(1);
        for (const journal of journals) {
            const amounts = journal.lines.map(
                (line) => Number(line.debit) + Number(line.credit),
            );
            expect(Math.max(...amounts)).toBeLessThanOrEqual(
                Number(syntheticCase.grNetTotal),
            );
        }
        expect(await db.journalEntry.count()).toBeGreaterThanOrEqual(
            journalCount,
        );
    });

    it('persists a maklon path with zero movement cost', async () => {
        const { db, seedGrValuationBaseline } = await lazy.load();
        const { receivedDate } = await seedGrValuationBaseline(db);
        const { createGoodsReceipt } = await import('../receipts-service');
        const customer = await db.customer.create({
            data: { id: 'gr-customer', name: 'GR maklon customer' },
        });
        await db.location.create({
            data: {
                id: 'gr-customer-location',
                name: 'GR customer location',
                slug: 'gr-customer-fixture',
                locationType: 'CUSTOMER_OWNED',
            },
        });
        await withActor(() =>
            createGoodsReceipt(
                {
                    isMaklon: true,
                    customerId: customer.id,
                    receivedDate,
                    notes: 'Maklon valuation fixture',
                    locationId: 'gr-customer-location',
                    items: [
                        {
                            productVariantId: 'gr-variant',
                            receivedQty: 3,
                            unitCost: 0,
                        },
                    ],
                },
                actor,
            ),
        );

        const gr = await db.goodsReceipt.findFirstOrThrow({
            where: { isMaklon: true },
            include: { items: true, movements: true },
        });
        expect(gr.purchaseOrderId).toBeNull();
        expect(gr.items[0].unitCost.toFixed(4)).toBe('0.0000');
        expect(gr.movements).toHaveLength(1);
        expect(gr.movements[0].cost?.toFixed(4)).toBe('0.0000');
    });

    it('keeps an explicit persisted unitCost on a no-PO receipt', async () => {
        const { db, seedGrValuationBaseline } = await lazy.load();
        const { receivedDate } = await seedGrValuationBaseline(db);
        const { createGoodsReceipt } = await import('../receipts-service');
        await withActor(() =>
            createGoodsReceipt(
                {
                    isMaklon: false,
                    purchaseOrderId: null,
                    receivedDate,
                    notes: 'Walk-in valuation fixture',
                    locationId: 'gr-location',
                    items: [
                        {
                            productVariantId: 'gr-variant-b',
                            receivedQty: 4,
                            unitCost: 12345,
                        },
                    ],
                },
                actor,
            ),
        );

        const gr = await db.goodsReceipt.findFirstOrThrow({
            where: { purchaseOrderId: null },
            include: { items: true, movements: true },
        });
        expect(gr.items[0].unitCost.toFixed(4)).toBe('12345.0000');
        expect(gr.movements).toHaveLength(1);
        expect(gr.movements[0].cost?.toFixed(4)).toBe('12345.0000');
    });

    it.each([
        { qtys: [1500], discount: 0, gross: '15000000', vat: '1486486.49', net: '13513513.51', unit: '9009.0090' },
        { qtys: [500, 1000], discount: 0, gross: '15000000', vat: '1486486.49', net: '13513513.51', unit: '9009.0090' },
        { qtys: [500, 1000], discount: 10, gross: '13500000', vat: '1337837.84', net: '12162162.16', unit: '8108.1081' },
    ])('clears bulk INCLUDE receipts exactly: $qtys, discount $discount', async (testCase) => {
        const { db, createGoodsReceipt, accounts } = await lazy.load();
        await db.purchaseOrderItem.update({ where: { id: 'gr-po-item' }, data: {
            unitPrice: '10000', discountPercent: testCase.discount,
            subtotal: testCase.gross, taxAmount: testCase.vat,
        } });
        await db.purchaseOrder.update({ where: { id: 'gr-po' }, data: {
            totalAmount: testCase.gross, taxAmount: testCase.vat,
        } });
        for (const qty of testCase.qtys) {
            await withActor(() => createGoodsReceipt({
                purchaseOrderId: 'gr-po', isMaklon: false, notes: 'bulk regression',
                receivedDate: new Date('2026-09-08T02:00:00Z'), locationId: 'gr-location',
                items: [{ purchaseOrderItemId: 'gr-po-item', productVariantId: 'gr-variant', receivedQty: qty }],
            }, actor));
        }
        const movements = await db.stockMovement.findMany({ where: { goodsReceipt: { purchaseOrderId: 'gr-po' } } });
        expect(movements).toHaveLength(testCase.qtys.length);
        expect(movements.every(m => m.cost?.toFixed(4) === testCase.unit)).toBe(true);
        const clearing = await db.journalLine.aggregate({
            where: { accountId: accounts.clearing.id, journalEntry: { status: 'POSTED' } },
            _sum: { debit: true, credit: true },
        });
        expect(clearing._sum.debit?.toFixed(2)).toBe(testCase.net);
        expect(clearing._sum.credit?.toFixed(2)).toBe(testCase.net);
    });

    it('rolls back every mutation when a post-mutation failure occurs', async () => {
        const { db, seedGrValuationBaseline } = await lazy.load();
        const { receivedDate } = await seedGrValuationBaseline(db);
        const invoices = await import('@/services/purchasing/invoices-service');
        const spy = vi
            .spyOn(invoices, 'createDraftBillFromPo')
            .mockRejectedValueOnce(new Error('synthetic post-mutation boom'));
        const before = {
            gr: await db.goodsReceipt.count(),
            items: await db.goodsReceiptItem.count(),
            movements: await db.stockMovement.count(),
            inventory: await db.inventory.count(),
            bills: await db.purchaseInvoice.count(),
            journals: await db.journalEntry.count(),
            po: await db.purchaseOrderItem.findUniqueOrThrow({
                where: { id: 'gr-po-item' },
            }),
        };
        const { createGoodsReceipt } = await import('../receipts-service');
        await expect(
            withActor(() =>
                createGoodsReceipt(
                    {
                        purchaseOrderId: 'gr-po',
                        isMaklon: false,
                        notes: 'GR valuation fixture',
                        receivedDate,
                        locationId: 'gr-location',
                        items: [
                            {
                                purchaseOrderItemId: 'gr-po-item',
                                productVariantId: 'gr-variant',
                                receivedQty: 1500,
                            },
                        ],
                    },
                    actor,
                ),
            ),
        ).rejects.toThrow('synthetic post-mutation boom');
        expect(await db.goodsReceipt.count()).toBe(before.gr);
        expect(await db.goodsReceiptItem.count()).toBe(before.items);
        expect(await db.stockMovement.count()).toBe(before.movements);
        expect(await db.inventory.count()).toBe(before.inventory);
        expect(await db.purchaseInvoice.count()).toBe(before.bills);
        expect(await db.journalEntry.count()).toBe(before.journals);
        const afterPo = await db.purchaseOrderItem.findUniqueOrThrow({
            where: { id: 'gr-po-item' },
        });
        expect(afterPo.receivedQty.toFixed(4)).toBe(
            before.po.receivedQty.toFixed(4),
        );
        spy.mockRestore();
    });
});
