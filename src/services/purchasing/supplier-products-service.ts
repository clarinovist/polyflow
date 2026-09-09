import { prisma } from '@/lib/core/prisma';
import type { Prisma } from '@prisma/client';

/** Read within withTenant. Receipt history is derived, never persisted as a manual link. */
export async function listSupplierProducts(supplierId: string) {
    const receiptWhere = {
        receivedQty: { gt: 0 },
        goodsReceipt: {
            isMaklon: false,
            purchaseOrder: { supplierId },
        },
    } satisfies Prisma.GoodsReceiptItemWhereInput;

    // Query variants rather than receipt lines: repeated/partial receipts and
    // manual + historical links must count only once per SKU. Walk-in receipts
    // use the same relation via their automatically created PO. Voided receipts
    // are deleted by the receiving service, so they disappear on the next read.
    const variants = await prisma.productVariant.findMany({
        where: {
            OR: [
                { supplierProducts: { some: { supplierId } } },
                { goodsReceiptItems: { some: receiptWhere } },
            ],
        },
        select: {
            id: true,
            name: true,
            skuCode: true,
            product: { select: { name: true } },
            supplierProducts: {
                where: { supplierId },
                select: {
                    id: true,
                    isPreferred: true,
                    unitPrice: true,
                    leadTimeDays: true,
                    minOrderQty: true,
                },
            },
            goodsReceiptItems: {
                where: receiptWhere,
                orderBy: [
                    { goodsReceipt: { receivedDate: 'desc' } },
                    { goodsReceipt: { createdAt: 'desc' } },
                    { id: 'desc' },
                ],
                take: 1,
                select: { unitCost: true },
            },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return variants.map((variant) => {
        const link = variant.supplierProducts.at(0);
        const receipt = variant.goodsReceiptItems.at(0);
        return {
            id: variant.id,
            linkId: link?.id ?? null,
            isPreferred: link?.isPreferred ?? false,
            unitPrice: link?.unitPrice == null ? null : Number(link.unitPrice),
            leadTimeDays: link?.leadTimeDays ?? null,
            minOrderQty:
                link?.minOrderQty == null ? null : Number(link.minOrderQty),
            hasReceiptHistory: receipt !== undefined,
            lastReceiptUnitCost: receipt ? Number(receipt.unitCost) : null,
            productVariant: {
                name: variant.name,
                skuCode: variant.skuCode,
                product: variant.product,
            },
        };
    });
}

export type SupplierProductSummary = Awaited<
    ReturnType<typeof listSupplierProducts>
>[number];
