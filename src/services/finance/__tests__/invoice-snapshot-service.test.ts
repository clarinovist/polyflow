import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { assertInvoiceAllocationKnown, buildInvoiceSnapshot } from '../invoice-snapshot-service';
import { snapshotJournalLines } from '../invoice-snapshot-journal';
import { readInvoiceSnapshot, invoiceSnapshotOrder } from '@/lib/finance/invoice-snapshot';
import { snapshotFixture } from '@/lib/finance/__tests__/invoice-snapshot-fixture';
const mocks = vi.hoisted(() => ({ account: vi.fn(), resolve: vi.fn() }));
vi.mock('@/services/accounting/account-resolver', () => ({ resolveAccount: mocks.account }));
vi.mock('@/services/accounting/revenue-account-resolver', () => ({ resolveRevenueAccount: mocks.resolve }));
const d = (n: number) => new Prisma.Decimal(n);
function orderFixture() { return { id: 'so', orderNumber: 'SO-test', customer: snapshotFixture().customer, shippingCost: d(20),
    deliveryOrders: [{ totalCharge: d(20) }], items: [{ id: 'item', productVariantId: 'a', quantity: d(100), deliveredQty: d(80), unitPrice: d(10),
        discountPercent: d(0), taxPercent: d(10), ppnMode: 'EXCLUDE', conversionFactorSnapshot: d(10), enteredUnit: 'ZAK', enteredUnitPrice: d(100),
        productVariant: { name: 'Original A', skuCode: 'A', primaryUnit: 'KG', revenueAccountId: 'revenue-a', productId: 'p', product: { name: 'Product A', revenueAccountId: null } } }] }; }
const db = { $queryRaw: vi.fn(), salesOrder: { findUnique: vi.fn() }, invoice: { findMany: vi.fn() } };
const tx = db as unknown as Prisma.TransactionClient;
let order = orderFixture();
beforeEach(() => { vi.resetAllMocks(); order = orderFixture(); db.salesOrder.findUnique.mockImplementation(async () => order); db.invoice.findMany.mockResolvedValue([]);
    mocks.account.mockImplementation(async (id: string) => ({ id })); mocks.resolve.mockImplementation(async (data: { variant: { revenueAccountId: string } }) => ({ accountId: data.variant.revenueAccountId })); });
describe('commercial snapshot', () => {
    it('captures 80 delivered, not 100 ordered; persists display and exact money', async () => {
        expect(await buildInvoiceSnapshot(tx, 'so', [])).toEqual(snapshotFixture());
    });
    it('allocates only next 20 and incremental shipping, keeps earlier snapshot unchanged', async () => {
        const first = await buildInvoiceSnapshot(tx, 'so', []);
        order.items[0].deliveredQty = d(100); order.deliveryOrders.push({ totalCharge: d(30) }); order.items[0].productVariant.name = 'Renamed';
        const next = await buildInvoiceSnapshot(tx, 'so', [{ id: 'first', status: 'PAID', commercialSnapshot: first }]);
        expect(next.items[0]).toMatchObject({ quantity: 20, netAmount: '200.00', taxAmount: '20.00', name: 'Renamed' });
        expect(next.shippingAmount).toBe('30.00'); expect(next.commercialTotal).toBe('250.00');
        expect(first.items[0].name).toBe('Original A');
    });
    it('handles included VAT/discount, ordered pre-invoice, and no new allocations', async () => {
        order.deliveryOrders = []; order.items[0].deliveredQty = d(0); order.items[0].ppnMode = 'INCLUDE'; order.items[0].discountPercent = d(10);
        const first = await buildInvoiceSnapshot(tx, 'so', []);
        expect(first.basis).toBe('ORDERED'); expect(first.items[0].netAmount).toBe('818.18'); expect(first.items[0].taxAmount).toBe('81.82');
        order.items[0].deliveredQty = d(80); order.deliveryOrders = [{ totalCharge: d(20) }];
        const next = await buildInvoiceSnapshot(tx, 'so', [{ id: 'first', status: 'PAID', commercialSnapshot: first }]);
        expect(next.items).toEqual([]); expect(next.commercialTotal).toBe('0.00');
    });
    it('refreshes sole draft allocation but fails closed legacy recognized/extra draft', async () => {
        expect((await buildInvoiceSnapshot(tx, 'so', [{ id: 'draft', status: 'DRAFT' }], 'draft')).commercialTotal).toBe('900.00');
        await expect(buildInvoiceSnapshot(tx, 'so', [{ id: 'old', status: 'PAID' }])).rejects.toThrow(/Atribusi/);
        await expect(buildInvoiceSnapshot(tx, 'so', [{ id: 'other', status: 'DRAFT', commercialSnapshot: snapshotFixture() }])).rejects.toThrow(/draft/);
        db.invoice.findMany.mockResolvedValue([{ commercialSnapshot: null }]);
        await expect(assertInvoiceAllocationKnown(tx, 'so')).rejects.toThrow(/Atribusi/);
        db.invoice.findMany.mockResolvedValue([{ commercialSnapshot: snapshotFixture() }]);
        await expect(assertInvoiceAllocationKnown(tx, 'so')).resolves.toBeUndefined();
    });
    it('blocks new shipment/revision for active price adjustment even if net adjustment is zero', async () => {
        db.invoice.findMany.mockResolvedValue([{ commercialSnapshot: snapshotFixture(), priceAdjustmentAmount: d(0), _count: { priceAdjustments: 2 } }]);
        await expect(assertInvoiceAllocationKnown(tx, 'so')).rejects.toThrow(/penyesuaian harga/);
        db.invoice.findMany.mockResolvedValue([{ commercialSnapshot: snapshotFixture(), priceAdjustmentAmount: d(10), _count: { priceAdjustments: 0 } }]);
        await expect(assertInvoiceAllocationKnown(tx, 'so')).rejects.toThrow(/penyesuaian harga/);
    });
    it('rejects changed historical price/product, negative quantities/shipping allocation and invalid factor', async () => {
        const prior = [{ id: 'old', status: 'PAID', commercialSnapshot: snapshotFixture() }];
        order.items[0].unitPrice = d(11); await expect(buildInvoiceSnapshot(tx, 'so', prior)).rejects.toThrow(/Atribusi/);
        order = orderFixture(); order.items[0].productVariantId = 'b'; await expect(buildInvoiceSnapshot(tx, 'so', prior)).rejects.toThrow(/Atribusi/);
        order = orderFixture(); order.items[0].deliveredQty = d(60); await expect(buildInvoiceSnapshot(tx, 'so', prior)).rejects.toThrow(/Atribusi/);
        order = orderFixture(); order.deliveryOrders = [{ totalCharge: d(10) }]; await expect(buildInvoiceSnapshot(tx, 'so', prior)).rejects.toThrow(/Atribusi/);
        order = orderFixture(); order.items[0].conversionFactorSnapshot = d(0); await expect(buildInvoiceSnapshot(tx, 'so', [])).rejects.toThrow();
        db.salesOrder.findUnique.mockResolvedValue(null); await expect(buildInvoiceSnapshot(tx, 'missing', [])).rejects.toThrow();
    });
    it('projects immutable rows, rejects malformed non-null snapshot, identifies legacy', () => {
        expect(invoiceSnapshotOrder(snapshotFixture())?.items[0]).toMatchObject({ quantity: 80, subtotal: 880, enteredQuantity: 8 });
        expect(invoiceSnapshotOrder(null)).toBeNull();
        expect(() => readInvoiceSnapshot({ version: 99 })).toThrow();
        expect(() => readInvoiceSnapshot(snapshotFixture({ commercialTotal: '1000.00' }))).toThrow();
    });
    it('posts exact invoice net/VAT/shipping and rounding rather than scaling SO', async () => {
        const lines = await snapshotJournalLines(snapshotFixture(), d(1000), d(100), tx, [], 'test');
        expect(lines).toEqual(expect.arrayContaining([
            expect.objectContaining({ accountId: 'accounts-receivable', debit: 1000 }),
            expect.objectContaining({ accountId: 'revenue-a', credit: 800 }),
            expect.objectContaining({ accountId: 'sales-revenue', credit: 20 }),
            expect.objectContaining({ accountId: 'vat-output', credit: 80 }),
            expect.objectContaining({ accountId: 'sales-rounding-income', credit: 100 }),
        ]));
        await expect(snapshotJournalLines(snapshotFixture(), d(900), d(100), tx, [], 'test')).rejects.toThrow(/total/);
        mocks.resolve.mockResolvedValue(null);
        expect((await snapshotJournalLines(snapshotFixture(), d(900), null, tx, [], 'test')).filter(l => l.accountId === 'sales-revenue')).toEqual([expect.objectContaining({ credit: 820 })]);
    });
});
