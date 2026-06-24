import { getDeliveryOrderById } from '@/actions/inventory/deliveries';
import { DeliveryOrderDetail } from '@/components/sales/DeliveryOrderDetail';
import { notFound } from 'next/navigation';
import { serializeData } from '@/lib/utils/utils';
import { getCompanyConfigAsync } from '@/lib/config/company';

interface DeliveryOrderPageProps {
    params: Promise<{ id: string }>;
}

export default async function DeliveryOrderPage({ params }: DeliveryOrderPageProps) {
    const { id } = await params;
    const [order, companyConfig] = await Promise.all([
        getDeliveryOrderById(id),
        getCompanyConfigAsync(),
    ]);

    if (!order) {
        notFound();
    }

    const serializedOrder = serializeData(order);

    return (
        <div className="p-6">
            <DeliveryOrderDetail order={serializedOrder} companyConfig={companyConfig} />
        </div>
    );
}
