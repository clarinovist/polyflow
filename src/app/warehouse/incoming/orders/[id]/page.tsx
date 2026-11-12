import type { ComponentProps } from 'react';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { notFound } from 'next/navigation';
import { PurchaseOrderDetailClient } from '@/components/purchasing/orders/PurchaseOrderDetailClient';
import { Metadata } from 'next';
import { serializeData } from '@/lib/utils/utils';
import { toPriceFreePurchaseOrder } from '@/lib/purchasing/purchase-order-price-redaction';

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

    const warehouseOrder = toPriceFreePurchaseOrder(rawOrder);

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
