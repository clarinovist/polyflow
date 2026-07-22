import React from 'react';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { Metadata } from 'next';
import { serializeData } from '@/lib/utils/utils';
import { withTenantPage } from '@/lib/core/tenant';
import { IncomingOperationalClient } from '@/components/warehouse/incoming/IncomingOperationalClient';

const getOperationalData = withTenantPage(async () => {
    const [receivablePOs, todayReceipts] = await Promise.all([
        PurchaseService.listReceivablePurchaseOrders(),
        PurchaseService.getGoodsReceiptsForDay(new Date()),
    ]);
    return { receivablePOs, todayReceipts };
});

export const metadata: Metadata = {
    title: 'Penerimaan Barang | Warehouse | PolyFlow',
};

export default async function WarehouseIncomingPage() {
    const data = await getOperationalData();

    return (
        <IncomingOperationalClient
            receivablePOs={serializeData(data.receivablePOs) as never}
            todayReceipts={serializeData(data.todayReceipts) as never}
        />
    );
}
