import React from 'react';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { getLocations } from '@/actions/inventory/inventory';
import { notFound } from 'next/navigation';
import { GoodsReceiptForm } from '@/components/purchasing/orders/GoodsReceiptForm';
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

export default async function WarehouseCreateReceiptPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const poId = params.poId;

    if (!poId) {
        return (
            <div className="p-6">
                <div className="text-center py-12">
                    <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h2 className="text-lg font-semibold">Pilih Purchase Order</h2>
                    <p className="text-muted-foreground mb-4">
                        Pilih PO dari antrean penerimaan untuk membuat goods receipt.
                    </p>
                    <a
                        href="/warehouse/incoming"
                        className="text-emerald-600 hover:underline text-sm font-medium"
                    >
                        Kembali ke antrean penerimaan
                    </a>
                </div>
            </div>
        );
    }

    const rawOrder = await getPoData(poId);

    if (!rawOrder) {
        notFound();
    }

    const order = serializeData(rawOrder);
    const locationsRes = await getLocations();
    const locations = locationsRes.success && locationsRes.data ? locationsRes.data : [];

    // Map order to GoodsReceiptForm props
    const formProps = {
        purchaseOrderId: order.id,
        orderNumber: order.orderNumber,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: (order.items || []).map((item: any) => ({
            productVariantId: item.productVariantId,
            productName: item.productVariant?.product?.name || item.productVariant?.name || '',
            skuCode: item.productVariant?.skuCode || '',
            orderedQty: Number(item.quantity),
            receivedQty: Number(item.receivedQty || 0),
            unitPrice: Number(item.unitPrice),
            unit: item.enteredUnit || item.productVariant?.primaryUnit || 'pcs',
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        locations: locations.map((loc: any) => ({ id: loc.id, name: loc.name })),
    };

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <GoodsReceiptForm {...formProps} basePath="/warehouse/incoming" />
        </div>
    );
}
