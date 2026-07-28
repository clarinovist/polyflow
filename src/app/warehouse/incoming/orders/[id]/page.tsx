import type { ComponentProps } from 'react';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { notFound } from 'next/navigation';
import { PurchaseOrderDetailClient } from '@/components/purchasing/orders/PurchaseOrderDetailClient';
import { Metadata } from 'next';
import { serializeData } from '@/lib/utils/utils';

import { withTenantPage } from '@/lib/core/tenant';

const getOrder = withTenantPage(async (id: string) => {
    return PurchaseService.getPurchaseOrderById(id);
});
interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export async function generateMetadata({
    params,
}: PageProps): Promise<Metadata> {
    const { id } = await params;
    const order = await getOrder(id);
    return {
        title: order
            ? `PO ${order.orderNumber} | PolyFlow Warehouse`
            : 'Order Not Found',
    };
}

export default async function WarehousePurchaseOrderDetailPage({
    params,
}: PageProps) {
    const { id } = await params;
    const rawOrder = await getOrder(id);

    if (!rawOrder) {
        notFound();
    }

    const warehouseOrder = {
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

    // Serialize all Prisma objects for Client Components
    const serializedOrder = serializeData(warehouseOrder);

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <PurchaseOrderDetailClient
                order={
                    serializedOrder as unknown as ComponentProps<
                        typeof PurchaseOrderDetailClient
                    >['order']
                }
                basePath="/warehouse/incoming"
                warehouseMode={true}
            />
        </div>
    );
}
