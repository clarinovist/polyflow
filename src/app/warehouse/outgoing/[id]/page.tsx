import { getSalesOrderById } from '@/actions/sales';
import { notFound } from 'next/navigation';
import { SalesOrderDetailClient } from '@/components/sales/SalesOrderDetailClient';
import { serializeData } from '@/lib/utils';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function WarehouseOutgoingOrderDetailPage({ params }: PageProps) {
    const { id } = await params;
    const order = await getSalesOrderById(id);

    if (!order) {
        notFound();
    }

    // Serialize all Prisma objects for Client Components
    const serializedOrder = serializeData(order);

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <SalesOrderDetailClient
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                order={serializedOrder as any}
                basePath="/warehouse/outgoing"
                warehouseMode={true}
            />
        </div>
    );
}
