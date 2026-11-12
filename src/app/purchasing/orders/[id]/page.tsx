import type { ComponentProps } from 'react';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { notFound } from 'next/navigation';
import { PurchaseOrderDetailClient } from '@/components/purchasing/orders/PurchaseOrderDetailClient';
import { Metadata } from 'next';
import { serializeData } from '@/lib/utils/utils';
import { auth } from '@/auth';
import { isReadOnlyFactoryManager } from '@/lib/auth/read-only-role';
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
        title: order ? `PO ${order.orderNumber}` : 'Order Not Found',
    };
}

export default async function PurchaseOrderDetailPage({ params }: PageProps) {
    const { id } = await params;
    const order = await getOrder(id);

    if (!order) {
        notFound();
    }

    // Read-only Kepala Pabrik follows the PO without prices or commercial
    // actions: redact on the server so no price reaches the client payload.
    const session = await auth();
    const isPriceHidden = isReadOnlyFactoryManager(session?.user);
    const visibleOrder = isPriceHidden
        ? toPriceFreePurchaseOrder(order)
        : order;

    // Serialize all Prisma objects for Client Components
    const serializedOrder = serializeData(visibleOrder);

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <PurchaseOrderDetailClient
                order={
                    serializedOrder as unknown as ComponentProps<
                        typeof PurchaseOrderDetailClient
                    >['order']
                }
                warehouseMode={isPriceHidden}
                canCreateReceipt={!isPriceHidden}
            />
        </div>
    );
}
