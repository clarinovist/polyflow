import { getDeliveryOrderById } from '@/actions/inventory/deliveries';
import { listWarehouseAttachments } from '@/actions/warehouse/operational-attachments';
import {
    DeliveryOrderDetail,
    type DeliveryOrderDetailData,
} from '@/components/sales/DeliveryOrderDetail';
import { notFound } from 'next/navigation';
import { serializeData } from '@/lib/utils/utils';
import { getCompanyConfigWithOverridesAsync } from '@/lib/config/company-settings';

interface DeliveryOrderPageProps {
    params: Promise<{ id: string }>;
}

export default async function DeliveryOrderPage({
    params,
}: DeliveryOrderPageProps) {
    const { id } = await params;
    const [result, companyConfig, attachmentsRes] = await Promise.all([
        getDeliveryOrderById(id),
        getCompanyConfigWithOverridesAsync(),
        listWarehouseAttachments({ deliveryOrderId: id }),
    ]);

    // getDeliveryOrderById returns safeAction shape: { success, data } | { success: false, error }
    if (!result || !result.success || !result.data) {
        notFound();
    }

    const serializedOrder = serializeData(result.data);
    const attachments =
        attachmentsRes.success && Array.isArray(attachmentsRes.data)
            ? (serializeData(attachmentsRes.data) as unknown as Array<{
                  id: string;
                  checkpoint: string;
                  documentType: string;
                  url: string;
                  originalName?: string | null;
                  mimeType?: string | null;
                  sizeBytes?: number | null;
                  note?: string | null;
                  createdAt: string;
                  uploadedBy?: { id: string; name: string | null } | null;
              }>)
            : [];

    return (
        <div className="p-6">
            <DeliveryOrderDetail
                order={serializedOrder as unknown as DeliveryOrderDetailData}
                companyConfig={companyConfig}
                attachments={attachments}
            />
        </div>
    );
}
