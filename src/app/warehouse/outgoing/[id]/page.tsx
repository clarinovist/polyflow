import { getSalesOrderById } from '@/actions/sales/sales';
import { notFound } from 'next/navigation';
import { SalesOrderDetailClient } from '@/components/sales/SalesOrderDetailClient';
import { serializeData } from '@/lib/utils/utils';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function WarehouseOutgoingOrderDetailPage({ params }: PageProps) {
    const { id } = await params;
    const response = await getSalesOrderById(id);

    if (!response || !response.success || !response.data) {
        notFound();
    }

    const order = response.data;

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
