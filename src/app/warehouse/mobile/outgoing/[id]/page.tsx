import { getDeliveryOrderById } from '@/actions/inventory/deliveries';
import { listWarehouseAttachments } from '@/actions/warehouse/operational-attachments';
import { serializeData } from '@/lib/utils/utils';
import { notFound } from 'next/navigation';
import { WarehouseOutgoingDetailClient } from './WarehouseOutgoingDetailClient';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function WarehouseMobileOutgoingDetailPage({
    params,
}: PageProps) {
    const { id } = await params;
    const [result, attachmentsRes] = await Promise.all([
        getDeliveryOrderById(id),
        listWarehouseAttachments({ deliveryOrderId: id }),
    ]);

    if (!result?.success || !result.data) {
        notFound();
    }

    const order = serializeData(result.data) as {
        id: string;
        orderNumber: string;
        status: string;
        deliveryDate: string;
        notes?: string;
        loadVerifiedAt?: string | null;
        sourceLocation?: { name: string };
        salesOrder?: {
            orderNumber: string;
            customer?: { name: string };
        };
        items: {
            id: string;
            quantity: number;
            verifiedQuantity?: number | null;
            productVariant?: {
                name: string;
                skuCode: string;
                primaryUnit: string;
            };
        }[];
    };

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
        <WarehouseOutgoingDetailClient order={order} attachments={attachments} />
    );
}
