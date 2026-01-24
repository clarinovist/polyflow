import { PurchaseService } from '@/services/purchase-service';
import { notFound } from 'next/navigation';
import { PurchaseOrderDetailClient } from '@/components/purchasing/PurchaseOrderDetailClient';
import { Metadata } from 'next';
import { serializeData } from '@/lib/utils';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const order = await PurchaseService.getPurchaseOrderById(id);
    return {
        title: order ? `PO ${order.orderNumber} | PolyFlow Warehouse` : 'Order Not Found',
    };
}

export default async function WarehousePurchaseOrderDetailPage({ params }: PageProps) {
    const { id } = await params;
    const order = await PurchaseService.getPurchaseOrderById(id);

    if (!order) {
        notFound();
    }

    // Serialize all Prisma objects for Client Components
    const serializedOrder = serializeData(order);

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <PurchaseOrderDetailClient
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                order={serializedOrder as any}
                basePath="/warehouse/incoming"
                warehouseMode={true}
            />
        </div>
    );
}
