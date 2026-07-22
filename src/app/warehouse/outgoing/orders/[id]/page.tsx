import { getSalesOrderById } from '@/actions/sales/sales';
import { notFound } from 'next/navigation';
import { SalesOrderDetailClient } from '@/components/sales/SalesOrderDetailClient';
import { serializeData } from '@/lib/utils/utils';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

/** Secondary: Sales Order context from warehouse (not the load queue unit of work). */
export default async function WarehouseOutgoingSODetailPage({ params }: PageProps) {
    const { id } = await params;
    const response = await getSalesOrderById(id);

    if (!response || !response.success || !response.data) {
        notFound();
    }

    const order = response.data;
    const serializedOrder = serializeData(order);

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <SalesOrderDetailClient
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                order={serializedOrder as any}
                basePath="/warehouse/outgoing/orders"
                warehouseMode={true}
            />
        </div>
    );
}
