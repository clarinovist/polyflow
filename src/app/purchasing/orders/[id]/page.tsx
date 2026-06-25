import { PurchaseService } from '@/services/purchasing/purchase-service';
import { notFound } from 'next/navigation';
import { PurchaseOrderDetailClient } from '@/components/purchasing/orders/PurchaseOrderDetailClient';
import { Metadata } from 'next';
import { serializeData } from '@/lib/utils/utils';

import { withTenantPage } from '@/lib/core/tenant';

const getOrder = withTenantPage(async (id) => {
    return PurchaseService.getPurchaseOrderById(id);
});
interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const order = await getOrder(id);
    return {
        title: order ? `PO ${order.orderNumber} | PolyFlow` : 'Order Not Found',
    };
}

export default async function PurchaseOrderDetailPage({ params }: PageProps) {
    const { id } = await params;
    const order = await getOrder(id);

    if (!order) {
        notFound();
    }

    // Serialize all Prisma objects for Client Components
    const serializedOrder = serializeData(order);

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PurchaseOrderDetailClient order={serializedOrder as any} />
        </div>
    );
}
