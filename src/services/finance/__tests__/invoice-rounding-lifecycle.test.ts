import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { snapshotFixture } from '@/lib/finance/__tests__/invoice-snapshot-fixture';
import { calculateSalesInvoiceTotalFromDelivered } from '../invoice-lifecycle-service';
// Rounding lifecycle contract only; real allocations have dedicated snapshot service/DB tests.
vi.mock('../invoice-snapshot-service', () => ({ buildInvoiceSnapshot: async (tx: never, id: string, rows: { id: string; totalAmount: Prisma.Decimal; roundingAmount: Prisma.Decimal | null }[], draftId?: string) => {
    const amount = Math.max(0, (await calculateSalesInvoiceTotalFromDelivered(id, tx)) - rows.filter(i => i.id !== draftId).reduce((s, i) => s + Number(i.totalAmount) - Number(i.roundingAmount ?? 0), 0)).toFixed(2);
    return snapshotFixture({ items: [], shippingAmount: amount, commercialTotal: amount, taxAmount: '0.00', discountAmount: '0.00' });
} }));

const { db, journal, audit } = vi.hoisted(() => ({
    db: {
        $transaction: vi.fn(), $queryRaw: vi.fn(),
        salesOrder: { findUnique: vi.fn() },
        invoice: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    }, journal: vi.fn(), audit: vi.fn(),
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: db, getTenantDbFromContext: () => db }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: audit }));
vi.mock('../auto-journal-service', () => ({ AutoJournalService: { handleSalesInvoiceCreated: journal } }));
import { createInvoice, createDraftInvoiceFromOrder } from '../invoice-lifecycle-service';
import { captureInvoiceReturnBasis, refreshDraftInvoiceReturnBasis } from '../invoice-return-basis-capture';
vi.mock('../invoice-return-basis-capture', () => ({ captureInvoiceReturnBasis: vi.fn().mockResolvedValue('CAPTURED'), refreshDraftInvoiceReturnBasis: vi.fn().mockResolvedValue('CAPTURED') }));

const dec = (n: number) => new Prisma.Decimal(n);
const input = { salesOrderId: 'so', invoiceDate: new Date('2026-09-14'), termOfPaymentDays: 30 };
const row = (id: string, total: number, rounding: number | null, status = 'DRAFT') => ({
    id, invoiceNumber: id, totalAmount: dec(total), roundingAmount: rounding == null ? null : dec(rounding), status,
    commercialSnapshot: snapshotFixture({ items: [], shippingAmount: (total - (rounding ?? 0)).toFixed(2), commercialTotal: (total - (rounding ?? 0)).toFixed(2), taxAmount: '0.00', discountAmount: '0.00' }),
});
let invoices: ReturnType<typeof row>[];
let order: Record<string, unknown>;

beforeEach(() => {
    vi.resetAllMocks();
    invoices = [];
    order = { id: 'so', orderNumber: 'SO-TEST', status: 'SHIPPED', totalAmount: dec(16642320),
        customerId: 'customer', items: [], deliveryOrders: [], shippingCost: null };
    db.salesOrder.findUnique.mockImplementation(async () => order);
    db.invoice.findMany.mockImplementation(async ({ where }) => where.invoiceNumber ? [] : invoices);
    db.invoice.create.mockImplementation(async ({ data }) => ({ id: 'new', ...data }));
    db.invoice.update.mockImplementation(async ({ where, data }) => ({ ...invoices.find(i => i.id === where.id), ...data }));
    db.$transaction.mockImplementation(async fn => fn(db));
});

describe('new-only sales invoice rounding', () => {
    it.each(['manual', 'automatic'])('persists rounded total, journal and audit in one transaction: %s', async mode => {
        const result = mode === 'manual' ? await createInvoice(input, 'actor') : await createDraftInvoiceFromOrder('so', 'actor');
        expect(result).toMatchObject({ totalAmount: 16642500, roundingAmount: 180 });
        expect(journal).toHaveBeenCalledWith('new', { tx: db });
        expect(captureInvoiceReturnBasis).toHaveBeenCalledWith(db, 'new');
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ tx: db, userId: 'actor' }));
    });
    it('rounds delivered quantity + VAT + shipping, not ordered quantity', async () => {
        order.items = [{ deliveredQty: dec(3), quantity: dec(10), unitPrice: dec(1000),
            discountPercent: dec(10), taxPercent: dec(11), ppnMode: 'EXCLUDE' }];
        order.deliveryOrders = [{ totalCharge: dec(323) }];
        await createInvoice(input, 'actor');
        expect(db.invoice.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ totalAmount: 3500, roundingAmount: 180 }),
        })); // 2700 + 297 + 323 = 3320
    });
    it('syncs legacy draft without opting it into rounding', async () => {
        invoices = [row('legacy', 16642000, null)];
        await createDraftInvoiceFromOrder('so', 'actor');
        expect(db.invoice.update).toHaveBeenCalledWith({ where: { id: 'legacy' }, data: expect.objectContaining({ totalAmount: 16642320, commercialSnapshot: expect.any(Object) }) });
        expect(journal).toHaveBeenCalledWith('legacy', { tx: db, refreshDraft: true });
    });
    it('refreshes journal when base changes but rounded total stays the same', async () => {
        invoices = [row('new-draft', 16642500, 200)];
        await createDraftInvoiceFromOrder('so', 'actor');
        expect(db.invoice.update).toHaveBeenCalledWith({ where: { id: 'new-draft' }, data: expect.objectContaining({ totalAmount: 16642500, roundingAmount: 180, commercialSnapshot: expect.any(Object) }) });
        expect(journal).toHaveBeenCalledWith('new-draft', { tx: db, refreshDraft: true });
        expect(refreshDraftInvoiceReturnBasis).toHaveBeenCalledWith(db, 'new-draft');
    });
    it('keeps a zero-adjustment new draft opted in on later sync', async () => {
        invoices = [row('new-draft', 16642000, 0)];
        await createDraftInvoiceFromOrder('so', 'actor');
        expect(db.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalAmount: 16642500, roundingAmount: 180 }) }));
    });
    it('does not rewrite unchanged new draft or its journal', async () => {
        invoices = [row('new-draft', 16642500, 180)];
        await createDraftInvoiceFromOrder('so', 'actor');
        expect(db.invoice.update).not.toHaveBeenCalled();
        expect(journal).not.toHaveBeenCalled();
    });
    it.each(['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE'])('never rounds legacy %s invoice on sync', async status => {
        invoices = [row('legacy', 16642320, null, status)];
        await createDraftInvoiceFromOrder('so', 'actor');
        expect(db.invoice.update).not.toHaveBeenCalled();
        expect(db.invoice.create).not.toHaveBeenCalled();
    });
    it('supplementary base excludes all prior rounding, including paid invoices', async () => {
        invoices = [row('first', 1000, 180, 'PAID'), row('second', 500, 180, 'UNPAID')];
        order.totalAmount = dec(1320); // previous commercial total 1140, remaining 180
        await createDraftInvoiceFromOrder('so', 'actor');
        expect(db.invoice.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ totalAmount: 500, roundingAmount: 320 }),
        }));
        expect(db.invoice.update).not.toHaveBeenCalled();
    });
    it('reuses supplementary draft and never bills already-covered base twice', async () => {
        invoices = [row('first', 1000, 180, 'UNPAID'), row('supplementary', 500, 180)];
        order.totalAmount = dec(1140);
        await createDraftInvoiceFromOrder('so', 'actor');
        expect(db.invoice.create).not.toHaveBeenCalled();
        expect(db.invoice.update).not.toHaveBeenCalled();
    });
    it('zero remainder does not cause an extra invoice for previous rounding', async () => {
        invoices = [row('first', 1000, 180, 'UNPAID')];
        order.totalAmount = dec(820);
        await createDraftInvoiceFromOrder('so', 'actor');
        expect(db.invoice.create).not.toHaveBeenCalled();
    });
    it.each(['manual', 'automatic'])('rejects audit failure inside the transaction: %s', async mode => {
        audit.mockRejectedValueOnce(new Error('audit unavailable'));
        const run = mode === 'manual' ? createInvoice(input, 'actor') : createDraftInvoiceFromOrder('so', 'actor');
        await expect(run).rejects.toThrow('audit unavailable');
        expect(db.$transaction).toHaveBeenCalledTimes(1);
    });
});
