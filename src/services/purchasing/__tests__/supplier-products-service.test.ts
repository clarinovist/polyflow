import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { listSupplierProducts } from '../supplier-products-service';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { productVariant: { findMany } } }));

const variant = {
    id: 'variant-1', name: 'Varian A', skuCode: 'SKU-A',
    product: { name: 'Bahan A' },
    supplierProducts: [], goodsReceiptItems: [],
};
const link = {
    id: 'link-1', isPreferred: true, unitPrice: new Prisma.Decimal('1200.25'),
    leadTimeDays: 3, minOrderQty: new Prisma.Decimal('2.5'),
};

beforeEach(() => { vi.resetAllMocks(); findMany.mockResolvedValue([]); });

describe('listSupplierProducts', () => {
    it('queries unique variants with manual links OR actual supplier receipts, never unreceived PO lines', async () => {
        await listSupplierProducts('supplier-1');
        const receiptWhere = {
            receivedQty: { gt: 0 },
            goodsReceipt: { isMaklon: false, purchaseOrder: { supplierId: 'supplier-1' } },
        };
        expect(findMany).toHaveBeenCalledExactlyOnceWith({
            where: { OR: [
                { supplierProducts: { some: { supplierId: 'supplier-1' } } },
                { goodsReceiptItems: { some: receiptWhere } },
            ] },
            select: {
                id: true, name: true, skuCode: true, product: { select: { name: true } },
                supplierProducts: {
                    where: { supplierId: 'supplier-1' },
                    select: { id: true, isPreferred: true, unitPrice: true, leadTimeDays: true, minOrderQty: true },
                },
                goodsReceiptItems: {
                    where: receiptWhere,
                    orderBy: [
                        { goodsReceipt: { receivedDate: 'desc' } },
                        { goodsReceipt: { createdAt: 'desc' } },
                        { id: 'desc' },
                    ],
                    take: 1, select: { unitCost: true },
                },
            },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
        });
        // No date cutoff or entrySource restriction: old and walk-in receipts
        // share this relation. No PO status restriction: GR is the evidence.
    });

    it('includes receipt-only products without manufacturing a deletable manual link', async () => {
        findMany.mockResolvedValue([{ ...variant, goodsReceiptItems: [{ unitCost: new Prisma.Decimal('99.125') }] }]);
        const result = await listSupplierProducts('supplier-1');
        expect(result).toEqual([{
            id: variant.id, linkId: null, isPreferred: false,
            unitPrice: null, leadTimeDays: null, minOrderQty: null,
            hasReceiptHistory: true, lastReceiptUnitCost: 99.125,
            productVariant: { name: variant.name, skuCode: variant.skuCode, product: variant.product },
        }]);
        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });

    it('preserves manual metadata with no receipts', async () => {
        findMany.mockResolvedValue([{ ...variant, supplierProducts: [link] }]);
        expect(await listSupplierProducts('supplier-1')).toEqual([expect.objectContaining({
            linkId: 'link-1', isPreferred: true, unitPrice: 1200.25,
            leadTimeDays: 3, minOrderQty: 2.5,
            hasReceiptHistory: false, lastReceiptUnitCost: null,
        })]);
    });

    it('counts a manually linked and repeatedly received variant once; never overwrites catalog price', async () => {
        findMany.mockResolvedValue([{
            ...variant, supplierProducts: [link],
            goodsReceiptItems: [{ unitCost: new Prisma.Decimal(900) }],
        }]);
        const result = await listSupplierProducts('supplier-1');
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ linkId: 'link-1', unitPrice: 1200.25, hasReceiptHistory: true, lastReceiptUnitCost: 900 });
    });

    it('preserves zero metadata and receipt costs instead of treating zero as missing', async () => {
        findMany.mockResolvedValue([{
            ...variant,
            supplierProducts: [{ ...link, isPreferred: false, unitPrice: new Prisma.Decimal(0), leadTimeDays: 0, minOrderQty: new Prisma.Decimal(0) }],
            goodsReceiptItems: [{ unitCost: new Prisma.Decimal(0) }],
        }]);
        expect((await listSupplierProducts('supplier-1'))[0]).toMatchObject({
            isPreferred: false, unitPrice: 0, leadTimeDays: 0, minOrderQty: 0, lastReceiptUnitCost: 0,
        });
    });

    it('preserves nullable manual metadata', async () => {
        findMany.mockResolvedValue([{ ...variant, supplierProducts: [{ ...link, unitPrice: null, leadTimeDays: null, minOrderQty: null }] }]);
        expect((await listSupplierProducts('supplier-1'))[0]).toMatchObject({
            linkId: 'link-1', unitPrice: null, leadTimeDays: null, minOrderQty: null,
        });
    });

    it('reads current records each time (voided receipts leave no persistent automatic links)', async () => {
        findMany.mockResolvedValueOnce([{ ...variant, goodsReceiptItems: [{ unitCost: new Prisma.Decimal(50) }] }]);
        expect(await listSupplierProducts('supplier-1')).toHaveLength(1);
        expect(await listSupplierProducts('supplier-1')).toEqual([]);
        expect(findMany).toHaveBeenCalledTimes(2);
    });

    it('does not disguise query failures as an empty supplier', async () => {
        findMany.mockRejectedValueOnce(new Error('Database unavailable'));
        await expect(listSupplierProducts('supplier-1')).rejects.toThrow('Database unavailable');
    });
});
