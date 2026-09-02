import { getDeliveryOrderById } from '@/actions/inventory/deliveries';
import { getSalesOrderById } from '@/actions/sales/sales';
import { listWarehouseAttachments } from '@/actions/warehouse/operational-attachments';
import {
    DeliveryOrderDetail,
    type DeliveryOrderDetailData,
} from '@/components/sales/DeliveryOrderDetail';
import type { AttachmentItem } from '@/components/warehouse/WarehouseAttachmentPanel';
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
export default async function WarehouseOutgoingDoDetailPage({
    params,
}: PageProps) {
    const { id } = await params;

    const [doResult, companyConfig, attachmentsRes] = await Promise.all([
        getDeliveryOrderById(id),
        getCompanyConfigWithOverridesAsync(),
        listWarehouseAttachments({ deliveryOrderId: id }),
    ]);

    if (doResult?.success && doResult.data) {
        const serializedOrder = serializeData(doResult.data);
        // Attachments are always optional evidence — never fail the page on them.
        const attachments =
            attachmentsRes.success && Array.isArray(attachmentsRes.data)
                ? (serializeData(
                      attachmentsRes.data,
                  ) as unknown as AttachmentItem[])
                : [];
        return (
            <div className="p-6">
                <DeliveryOrderDetail
                    order={
                        serializedOrder as unknown as DeliveryOrderDetailData
                    }
                    companyConfig={companyConfig}
                    basePath="/warehouse/outgoing"
                    warehouseMode={true}
                    attachments={attachments}
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
