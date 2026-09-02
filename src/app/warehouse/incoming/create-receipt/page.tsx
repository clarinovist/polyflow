import React from 'react';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { getLocations } from '@/actions/inventory/inventory';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { GoodsReceiptForm } from '@/components/purchasing/orders/GoodsReceiptForm';
import { listWarehouseAttachments } from '@/actions/warehouse/operational-attachments';
import type { AttachmentItem } from '@/components/warehouse/WarehouseAttachmentPanel';
import { Metadata } from 'next';
import { ShoppingCart } from 'lucide-react';
import { serializeData } from '@/lib/utils/utils';
import { withTenantPage } from '@/lib/core/tenant';

const getPoData = withTenantPage(async (poId: string) => {
    return PurchaseService.getPurchaseOrderById(poId);
});

export const metadata: Metadata = {
    title: 'Post Goods Receipt | PolyFlow Warehouse',
};

interface PageProps {
    searchParams: Promise<{
        poId?: string;
    }>;
}

/** Fields consumed from a serialized purchase-order item when building the receipt form. */
type ReceiptOrderItem = {
    id: string;
    productVariantId: string;
    quantity: number;
    receivedQty?: number | null;
    enteredUnit?: string | null;
    productVariant?: {
        name?: string | null;
        skuCode?: string | null;
        primaryUnit?: string | null;
        product?: { name?: string | null } | null;
    } | null;
};

export default async function WarehouseCreateReceiptPage({
    searchParams,
}: PageProps) {
    const params = await searchParams;
    const poId = params.poId;

    if (!poId) {
        return (
            <div className="p-6">
                <div className="text-center py-12">
                    <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h2 className="text-lg font-semibold">
                        Pilih Purchase Order
                    </h2>
                    <p className="text-muted-foreground mb-4">
                        Pilih PO dari antrean penerimaan untuk membuat goods
                        receipt.
                    </p>
                    <Link
                        href="/warehouse/incoming"
                        className="text-emerald-600 hover:underline text-sm font-medium"
                    >
                        Kembali ke antrean penerimaan
                    </Link>
                </div>
            </div>
        );
    }

    const rawOrder = await getPoData(poId);

    if (!rawOrder) {
        notFound();
    }

    const order = serializeData(rawOrder);
    const [locationsRes, attachmentsRes] = await Promise.all([
        getLocations(),
        listWarehouseAttachments({ purchaseOrderId: poId }),
    ]);
    const locations =
        locationsRes.success && locationsRes.data ? locationsRes.data : [];
    // Attachments are optional evidence — never block receiving on them.
    const attachments =
        attachmentsRes.success && Array.isArray(attachmentsRes.data)
            ? (serializeData(
                  attachmentsRes.data,
              ) as unknown as AttachmentItem[])
            : [];

    // Map order to GoodsReceiptForm props
    const formProps = {
        purchaseOrderId: order.id,
        orderNumber: order.orderNumber,
        items: (order.items || []).map((item: ReceiptOrderItem) => ({
            purchaseOrderItemId: item.id,
            productVariantId: item.productVariantId,
            productName:
                item.productVariant?.product?.name ||
                item.productVariant?.name ||
                '',
            skuCode: item.productVariant?.skuCode || '',
            orderedQty: Number(item.quantity),
            receivedQty: Number(item.receivedQty || 0),
            unit: item.enteredUnit || item.productVariant?.primaryUnit || 'pcs',
        })),
        locations: locations.map((loc: { id: string; name: string }) => ({
            id: loc.id,
            name: loc.name,
        })),
    };

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <GoodsReceiptForm
                {...formProps}
                basePath="/warehouse/incoming"
                attachments={attachments}
            />
        </div>
    );
}
