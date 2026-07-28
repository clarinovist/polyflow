import type { ComponentProps } from 'react';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { notFound } from 'next/navigation';
import { GoodsReceiptDetailClient } from '@/components/purchasing/orders/GoodsReceiptDetailClient';
import { Metadata } from 'next';
import { serializeData } from '@/lib/utils/utils';

import { withTenantPage } from '@/lib/core/tenant';

const getReceipt = withTenantPage(async (id: string) => {
    return PurchaseService.getGoodsReceiptById(id);
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
    const receipt = await getReceipt(id);
    return {
        title: receipt
            ? `${receipt.receiptNumber} | PolyFlow Warehouse`
            : 'Receipt Not Found',
    };
}

export default async function WarehouseGoodsReceiptDetailPage({
    params,
}: PageProps) {
    const { id } = await params;
    const rawReceipt = await getReceipt(id);

    if (!rawReceipt) {
        notFound();
    }

    const warehouseReceipt = {
        id: rawReceipt.id,
        receiptNumber: rawReceipt.receiptNumber,
        receivedDate: rawReceipt.receivedDate,
        notes: rawReceipt.notes,
        isMaklon: rawReceipt.isMaklon,
        purchaseOrder: rawReceipt.purchaseOrder
            ? {
                  id: rawReceipt.purchaseOrder.id,
                  orderNumber: rawReceipt.purchaseOrder.orderNumber,
                  supplier: {
                      name: rawReceipt.purchaseOrder.supplier.name,
                      code: rawReceipt.purchaseOrder.supplier.code,
                  },
              }
            : null,
        customer: rawReceipt.customer
            ? {
                  name: rawReceipt.customer.name,
                  code: rawReceipt.customer.code,
              }
            : null,
        location: { name: rawReceipt.location.name },
        createdBy: { name: rawReceipt.createdBy?.name || 'Sistem' },
        items: rawReceipt.items.map((item) => ({
            id: item.id,
            receivedQty: Number(item.receivedQty),
            productVariant: {
                id: item.productVariant.id,
                name: item.productVariant.name,
                skuCode: item.productVariant.skuCode,
                primaryUnit: item.productVariant.primaryUnit,
            },
        })),
    };

    // Serialize all Prisma objects for Client Components
    const serializedReceipt = serializeData(warehouseReceipt);

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <GoodsReceiptDetailClient
                receipt={
                    serializedReceipt as unknown as ComponentProps<
                        typeof GoodsReceiptDetailClient
                    >['receipt']
                }
                basePath="/warehouse/incoming"
            />
        </div>
    );
}
