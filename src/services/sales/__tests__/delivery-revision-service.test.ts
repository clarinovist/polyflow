import { prisma } from '@/lib/core/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, Unit } from '@prisma/client';
import { getDeliveryRevision, reviseDelivery, searchRevisionProducts } from '../delivery-revision-service';
import { deliveryRevisionSchema } from '@/lib/schemas/delivery-revision';

vi.mock('@/services/finance/invoice-snapshot-service', () => ({ assertInvoiceAllocationKnown: vi.fn() }));
const mocks = vi.hoisted(() => ({
    db: {
        $queryRaw: vi.fn(),
        deliveryOrder: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
        salesOrder: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
        salesOrderItem: { update: vi.fn(), create: vi.fn() },
        deliveryOrderItem: { deleteMany: vi.fn() },
        productVariant: { findMany: vi.fn() },
        stockReservation: { updateMany: vi.fn() },
        customer: { findUnique: vi.fn() }, invoice: { findMany: vi.fn() },
    },
    audit: vi.fn(), validateStock: vi.fn(), reserve: vi.fn(), flag: vi.fn(),
}));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: () => prisma, prisma: { ...mocks.db, $transaction: async (fn: (tx: typeof mocks.db) => unknown) => fn(mocks.db) } }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.audit }));
vi.mock('@/services/inventory/core-service', () => ({ InventoryCoreService: { validateAndLockStock: mocks.validateStock } }));
vi.mock('@/services/inventory/reservation-service', () => ({ createStockReservation: mocks.reserve }));
vi.mock('@/lib/config/stock-reservation-flag', () => ({ isSalesStockReservationEnabled: mocks.flag }));
const D = (n: number) => new Prisma.Decimal(n);
const now = new Date('2026-09-19T00:00:00.000Z');
function fixture() {
    return {
        id: 'do', salesOrderId: 'so', updatedAt: now, status: 'LOADING', stockCommittedAt: null,
        sourceLocationId: 'warehouse', items: [{ id: 'doi', productVariantId: 'a', quantity: D(100), notes: 'packing' }],
        salesOrder: {
            id: 'so', orderNumber: 'SO-test', updatedAt: now, status: 'CONFIRMED', orderType: 'MAKE_TO_STOCK',
            priceStatus: null, customerId: 'customer', shippingCost: D(10), totalAmount: D(1010),
            invoices: [] as Array<{ status: string; totalAmount: Prisma.Decimal; roundingAmount: Prisma.Decimal | null }>,
            items: [{ id: 'soi', productVariantId: 'a', quantity: D(100), deliveredQty: D(0), unitPrice: D(10),
                discountPercent: D(0), taxPercent: D(0), ppnMode: 'EXCLUDE', isFreeItem: false,
                conversionFactorSnapshot: D(10), enteredUnit: Unit.ZAK,
                productVariant: { name: 'Barang A', primaryUnit: Unit.KG, product: { productType: 'FINISHED_GOOD' } } }],
        },
    };
}
const input = () => ({ deliveryOrderId: 'do', orderVersion: now.toISOString(), deliveryVersion: now.toISOString(), reason: 'Muatan disesuaikan', remainder: 'KEEP' as const, items: [{ salesOrderItemId: 'soi', quantity: 80 }], additions: [] });
let record = fixture();
beforeEach(() => {
    vi.resetAllMocks(); record = fixture();
    mocks.db.deliveryOrder.findUnique.mockImplementation(async () => record);
    mocks.db.deliveryOrder.count.mockResolvedValue(0);
    mocks.db.productVariant.findMany.mockResolvedValue([]);
    mocks.db.salesOrderItem.create.mockResolvedValue({ id: 'new-soi' });
    mocks.flag.mockReturnValue(true);
    mocks.db.customer.findUnique.mockResolvedValue({ creditLimit: D(0) });
});

describe('revisi muatan', () => {
    it('KEEP preserves order and reservation, changes DO and clears verification atomically', async () => {
        await reviseDelivery(input(), 'sales');
        expect(mocks.db.salesOrderItem.update).not.toHaveBeenCalled();
        expect(mocks.db.stockReservation.updateMany).not.toHaveBeenCalled();
        expect(mocks.db.deliveryOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
            loadVerifiedAt: null, loadVerifiedById: null,
            items: { create: [expect.objectContaining({ quantity: 80, enteredQuantity: 8, conversionFactorSnapshot: 10, notes: 'packing' })] },
        }) }));
        expect(mocks.audit).toHaveBeenCalledTimes(2);
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tx: mocks.db, changes: expect.objectContaining({ remainder: 'KEEP', before: expect.any(Array), after: expect.any(Array) }) }));
    });
    it('CLOSE + replacement preserves old identity and prices, recalculates SO and reservations', async () => {
        mocks.db.productVariant.findMany.mockResolvedValue([{ id: 'b', primaryUnit: Unit.KG }]);
        await reviseDelivery({ ...input(), remainder: 'CLOSE', additions: [{ productVariantId: 'b', quantity: 20, unitPrice: 15, taxPercent: 10, ppnMode: 'EXCLUDE' }] }, 'sales');
        expect(mocks.db.salesOrderItem.update).toHaveBeenCalledWith({ where: { id: 'soi' }, data: expect.objectContaining({ quantity: 80, enteredQuantity: 8, subtotal: 800 }) });
        expect(mocks.db.salesOrderItem.update.mock.calls[0][0].data).not.toHaveProperty('productVariantId');
        expect(mocks.db.salesOrderItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ productVariantId: 'b', unitPrice: 15, quantity: 20, enteredUnit: Unit.KG }) }));
        expect(mocks.db.salesOrder.update).toHaveBeenCalledWith({ where: { id: 'so' }, data: { totalAmount: 1140, discountAmount: 0, taxAmount: 30 } });
        expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ productVariantId: 'a', quantity: 80 }), mocks.db);
        expect(mocks.validateStock).toHaveBeenCalledWith(mocks.db, 'warehouse', 'b', 20, 'so');
    });
    it('retains historical delivered and zero-quantity identities; never rewrites deliveredQty', async () => {
        record.salesOrder.items[0].deliveredQty = D(30);
        record.salesOrder.invoices = [{ status: 'PAID', totalAmount: D(300), roundingAmount: null }];
        mocks.db.productVariant.findMany.mockResolvedValue([{ id: 'b', primaryUnit: Unit.KG }]);
        await reviseDelivery({ ...input(), remainder: 'CLOSE', items: [{ salesOrderItemId: 'soi', quantity: 0 }], additions: [{ productVariantId: 'b', quantity: 20, unitPrice: 15, taxPercent: 0, ppnMode: 'INCLUDE' }] }, 'sales');
        const fields = mocks.db.salesOrderItem.update.mock.calls[0][0].data;
        expect(fields.quantity).toBe(30); expect(fields).not.toHaveProperty('deliveredQty');
        expect(mocks.reserve).not.toHaveBeenCalledWith(expect.objectContaining({ productVariantId: 'a' }), expect.anything());
    });
    it('increased load expands SO and reserves the new residual, respects disabled reservation flag', async () => {
        mocks.flag.mockReturnValue(false);
        await reviseDelivery({ ...input(), items: [{ salesOrderItemId: 'soi', quantity: 110 }] }, 'sales');
        expect(mocks.db.salesOrderItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantity: 110 }) }));
        expect(mocks.reserve).not.toHaveBeenCalled();
    });
    it.each(['SHIPPED', 'DELIVERED', 'CANCELLED'])('rejects DO %s without writes', async (status) => {
        record.status = status;
        await expect(reviseDelivery(input(), 'sales')).rejects.toThrow(/sebelum/);
        expect(mocks.db.deliveryOrderItem.deleteMany).not.toHaveBeenCalled();
    });
    it('rejects stale order and stale verification version', async () => {
        await expect(reviseDelivery({ ...input(), orderVersion: new Date(0).toISOString() }, 'sales')).rejects.toThrow(/berubah/);
        await expect(reviseDelivery({ ...input(), deliveryVersion: new Date(0).toISOString() }, 'sales')).rejects.toThrow(/berubah/);
    });
    it('rejects missing DO, duplicate variant, foreign/omitted lines, parallel DO, mismatched DO', async () => {
        mocks.db.deliveryOrder.findUnique.mockResolvedValueOnce(null);
        await expect(reviseDelivery(input(), 'sales')).rejects.toThrow();
        record.salesOrder.items.push({ ...record.salesOrder.items[0], id: 'duplicate' });
        await expect(reviseDelivery(input(), 'sales')).rejects.toThrow(/duplikat/);
        record = fixture();
        await expect(reviseDelivery({ ...input(), items: [{ salesOrderItemId: 'foreign', quantity: 80 }] }, 'sales')).rejects.toThrow(/Daftar item/);
        mocks.db.deliveryOrder.count.mockResolvedValueOnce(1);
        await expect(reviseDelivery(input(), 'sales')).rejects.toThrow(/aktif lain/);
        record.items[0].productVariantId = 'foreign';
        await expect(reviseDelivery(input(), 'sales')).rejects.toThrow(/tidak cocok/);
    });
    it('rejects pending prices, terminal SO and service orders', async () => {
        record.salesOrder.priceStatus = 'PENDING' as never;
        await expect(reviseDelivery(input(), 'sales')).rejects.toThrow(/persetujuan/);
        record = fixture(); record.salesOrder.status = 'CANCELLED';
        await expect(reviseDelivery(input(), 'sales')).rejects.toThrow(/status/);
        record = fixture(); record.salesOrder.items[0].productVariant.product.productType = 'SERVICE';
        await expect(reviseDelivery(input(), 'sales')).rejects.toThrow(/fisik/);
    });
    it('rejects unknown/archived new products and existing product masquerading as addition', async () => {
        const additions = [{ productVariantId: 'b', quantity: 10, unitPrice: 10, taxPercent: 0, ppnMode: 'EXCLUDE' as const }];
        await expect(reviseDelivery({ ...input(), additions }, 'sales')).rejects.toThrow(/diarsipkan/);
        additions[0].productVariantId = 'a';
        await expect(reviseDelivery({ ...input(), additions }, 'sales')).rejects.toThrow(/sudah ada/);
    });
    it('blocks pre-shipment invoices and incomplete prices', async () => {
        record.salesOrder.invoices = [{ status: 'DRAFT', totalAmount: D(1000), roundingAmount: null }];
        await expect(reviseDelivery(input(), 'sales')).rejects.toThrow(/invoice/);
        record = fixture(); record.salesOrder.items[0].unitPrice = D(0);
        await expect(reviseDelivery(input(), 'sales')).rejects.toThrow(/Harga/);
    });
    it('credit limit checks incremental exposure including shipping', async () => {
        mocks.db.customer.findUnique.mockResolvedValue({ creditLimit: D(1050) });
        mocks.db.invoice.findMany.mockResolvedValue([]); mocks.db.salesOrder.findMany.mockResolvedValue([]);
        await expect(reviseDelivery({ ...input(), items: [{ salesOrderItemId: 'soi', quantity: 110 }] }, 'sales')).rejects.toThrow(/kredit/);
        expect(mocks.db.deliveryOrderItem.deleteMany).not.toHaveBeenCalled();
    });
    it('stock failure rejects before destructive replacement; audit failure propagates for transaction rollback', async () => {
        mocks.validateStock.mockRejectedValueOnce(new Error('stock'));
        await expect(reviseDelivery(input(), 'sales')).rejects.toThrow('stock');
        expect(mocks.db.deliveryOrderItem.deleteMany).not.toHaveBeenCalled();
        mocks.audit.mockRejectedValueOnce(new Error('audit'));
        await expect(reviseDelivery(input(), 'sales')).rejects.toThrow('audit');
    });
    it('loads editor with primary quantities and bounded product query', async () => {
        expect(await getDeliveryRevision('do')).toEqual(expect.objectContaining({ items: [expect.objectContaining({ ordered: 100, quantity: 100, unit: Unit.KG })] }));
        await searchRevisionProducts('barang');
        expect(mocks.db.productVariant.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 30, where: expect.objectContaining({ archivedAt: null }) }));
        mocks.db.deliveryOrder.findUnique.mockResolvedValueOnce(null);
        await expect(getDeliveryRevision('missing')).rejects.toThrow();
    });
});

describe('revision schema', () => {
    it.each([-1, NaN, Infinity, 0.00001])('rejects invalid quantity %s', (quantity) => {
        expect(deliveryRevisionSchema.safeParse({ ...input(), items: [{ salesOrderItemId: 'soi', quantity }] }).success).toBe(false);
    });
    it('rejects zero-only and duplicate lines, validates reason', () => {
        expect(deliveryRevisionSchema.safeParse({ ...input(), items: [{ salesOrderItemId: 'soi', quantity: 0 }] }).success).toBe(false);
        expect(deliveryRevisionSchema.safeParse({ ...input(), items: [...input().items, ...input().items] }).success).toBe(false);
        expect(deliveryRevisionSchema.safeParse({ ...input(), reason: ' ' }).success).toBe(false);
    });
});
