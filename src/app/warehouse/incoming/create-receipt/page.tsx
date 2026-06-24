import React from 'react';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { getLocations } from '@/actions/inventory/inventory';
import { notFound } from 'next/navigation';
import { GoodsReceiptForm } from '@/components/planning/purchasing/GoodsReceiptForm';
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
                    <p className="text-muted-foreground">Pilih PO dari daftar untuk membuat goods receipt.</p>
                </div>
            </div>
        );
    }

    const order = await getPoData(poId);

    if (!order) {
        notFound();
    }

    const locationsRes = await getLocations();
    const locations = locationsRes.success && locationsRes.data ? locationsRes.data : [];

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <GoodsReceiptForm
                order={serializeData(order)}
                locations={serializeData(locations)}
            />
        </div>
    );
}
