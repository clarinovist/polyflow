import React from 'react';
import { getCustomers } from '@/actions/sales/customer';
import { getLocations } from '@/actions/inventory/locations';
import { getProductVariants } from '@/actions/inventory/inventory';
import { MaklonGoodsReceiptForm } from '@/components/purchasing/orders/MaklonGoodsReceiptForm';
import { Metadata } from 'next';

import { serializeData } from '@/lib/utils/utils';

import { MAKLON_STAGE_SLUGS } from '@/lib/constants/locations';

export const metadata: Metadata = {
    title: 'Receive Maklon Goods | Warehouse | PolyFlow',
};

export default async function CreateMaklonReceiptPage() {
    // 1. Fetch Master Data Needed for Maklon
    const customersRes = await getCustomers();
    const customers = customersRes.success && customersRes.data ? customersRes.data : [];

    const locationsRes = await getLocations();
    const allLocations = locationsRes.success && locationsRes.data ? locationsRes.data : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locations = (allLocations as any[]).filter((l: any) => l.locationType === 'CUSTOMER_OWNED');

    const productVariantsRes = await getProductVariants();
    const productVariants = productVariantsRes.success && productVariantsRes.data ? productVariantsRes.data : [];

    // 2. Format product variants for the form
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedVariants = (productVariants as any[]).map((v: any) => ({
        id: v.id,
        name: v.product?.name || v.name,
        skuCode: v.skuCode,
    }));

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Penerimaan Barang Maklon</h1>
                <p className="text-muted-foreground">Register raw materials and items supplied by customers for maklon orders.</p>
            </div>

            <MaklonGoodsReceiptForm
                customers={serializeData(customers)}
                productVariants={serializeData(formattedVariants)}
                locations={serializeData(locations)}
                defaultLocationId={locations.find((location: { slug: string }) => location.slug === MAKLON_STAGE_SLUGS.RAW_MATERIAL)?.id || locations[0]?.id}
                basePath="/warehouse/incoming"
            />
        </div>
    );
}
