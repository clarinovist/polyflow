import type { PurchaseService } from '@/services/purchasing/purchase-service';

export type RawPurchaseOrder = NonNullable<
    Awaited<ReturnType<typeof PurchaseService.getPurchaseOrderById>>
>;

/**
 * Operational view of a purchase order with every price, tax, discount,
 * shipping, invoice and supplier-term field removed or zeroed. Used for roles
 * that may follow a PO but must not see purchase prices (warehouse portal,
 * read-only Kepala Pabrik). The returned value is the payload sent to the
 * client, so nothing price-related may be carried over from `rawOrder`.
 */
export function toPriceFreePurchaseOrder(rawOrder: RawPurchaseOrder) {
    return {
        id: rawOrder.id,
        orderNumber: rawOrder.orderNumber,
        status: rawOrder.status,
        orderDate: rawOrder.orderDate,
        expectedDate: rawOrder.expectedDate,
        deliveryAddress: rawOrder.deliveryAddress,
        notes: rawOrder.notes,
        createdAt: rawOrder.createdAt,
        updatedAt: rawOrder.updatedAt,
        createdBy: rawOrder.createdBy,
        supplier: {
            id: rawOrder.supplier.id,
            name: rawOrder.supplier.name,
            code: rawOrder.supplier.code,
            paymentTermDays: null,
        },
        items: rawOrder.items.map((item) => ({
            id: item.id,
            productVariantId: item.productVariantId,
            quantity: Number(item.quantity),
            receivedQty: Number(item.receivedQty),
            unitPrice: 0,
            subtotal: 0,
            dppOtherAmount: null,
            taxPercent: 0,
            taxAmount: 0,
            discountPercent: 0,
            productVariant: {
                id: item.productVariant.id,
                name: item.productVariant.name,
                skuCode: item.productVariant.skuCode,
                primaryUnit: item.productVariant.primaryUnit,
            },
        })),
        goodsReceipts: rawOrder.goodsReceipts.map((gr) => ({
            id: gr.id,
            receiptNumber: gr.receiptNumber,
            receivedDate: gr.receivedDate,
            location: gr.location,
            createdBy: gr.createdBy,
        })),
        invoices: [],
        totalAmount: null,
        discountAmount: 0,
        taxAmount: 0,
        shippingCost: 0,
    };
}
