import { getDeliveryOrderById } from '@/actions/inventory/deliveries';
import { getSalesOrderById } from '@/actions/sales/sales';
import { DeliveryOrderDetail, type DeliveryOrderDetailData } from '@/components/sales/DeliveryOrderDetail';
import { notFound, redirect } from 'next/navigation';
import { serializeData } from '@/lib/utils/utils';
import { getCompanyConfigWithOverridesAsync } from '@/lib/config/company-settings';

interface PageProps {
    params: Promise<{ id: string }>;
}

/**
 * Warehouse DO detail for load ops.
 * Dual-id fallback: if `id` is a Sales Order (legacy links), redirect to /orders/[id].
 */
export default async function WarehouseOutgoingDoDetailPage({ params }: PageProps) {
    const { id } = await params;

    const [doResult, companyConfig] = await Promise.all([
        getDeliveryOrderById(id),
        getCompanyConfigWithOverridesAsync(),
    ]);

    if (doResult?.success && doResult.data) {
        const serializedOrder = serializeData(doResult.data);
        return (
            <div className="p-6">
                <DeliveryOrderDetail
                    order={serializedOrder as unknown as DeliveryOrderDetailData}
                    companyConfig={companyConfig}
                    basePath="/warehouse/outgoing"
                    warehouseMode={true}
                />
            </div>
        );
    }

    // Legacy: id might be a Sales Order id from old Antrian Kirim (SO) links
    const soResult = await getSalesOrderById(id);
    if (soResult?.success && soResult.data) {
        redirect(`/warehouse/outgoing/orders/${id}`);
    }

    notFound();
}
