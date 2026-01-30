import { getDeliveryOrderById } from '@/actions/deliveries';
import { DeliveryOrderDetail } from '@/components/sales/DeliveryOrderDetail';
import { notFound } from 'next/navigation';
import { serializeData } from '@/lib/utils';

interface DeliveryOrderPageProps {
    params: Promise<{ id: string }>;
}

export default async function DeliveryOrderPage({ params }: DeliveryOrderPageProps) {
    const { id } = await params;
    const order = await getDeliveryOrderById(id);

    if (!order) {
        notFound();
    }

    const serializedOrder = serializeData(order);

    return (
        <div className="p-6">
            <DeliveryOrderDetail order={serializedOrder} />
        </div>
    );
}
