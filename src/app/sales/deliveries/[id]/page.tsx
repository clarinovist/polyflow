import { getDeliveryOrderById } from '@/actions/inventory/deliveries';
import { DeliveryOrderDetail, type DeliveryOrderDetailData } from '@/components/sales/DeliveryOrderDetail';
import { notFound } from 'next/navigation';
import { serializeData } from '@/lib/utils/utils';
import { getCompanyConfigWithOverridesAsync } from '@/lib/config/company-settings';

interface DeliveryOrderPageProps {
    params: Promise<{ id: string }>;
}

export default async function DeliveryOrderPage({ params }: DeliveryOrderPageProps) {
    const { id } = await params;
    const [order, companyConfig] = await Promise.all([
        getDeliveryOrderById(id),
        getCompanyConfigWithOverridesAsync(),
    ]);

    if (!order) {
        notFound();
    }

    const serializedOrder = serializeData(order);

    return (
        <div className="p-6">
            <DeliveryOrderDetail order={serializedOrder as unknown as DeliveryOrderDetailData} companyConfig={companyConfig} />
        </div>
    );
}
