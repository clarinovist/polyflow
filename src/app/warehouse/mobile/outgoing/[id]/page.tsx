import { getDeliveryOrderById } from '@/actions/inventory/deliveries';
import { getSalesOrderById } from '@/actions/sales/sales';
import { listWarehouseAttachments } from '@/actions/warehouse/operational-attachments';
import { serializeData } from '@/lib/utils/utils';
import { notFound, redirect } from 'next/navigation';
import {
    WarehouseOutgoingDetailClient,
    type WarehouseOutgoingOrder,
} from './WarehouseOutgoingDetailClient';
import { auth } from '@/auth';
import { hasAnyRole } from '@/lib/auth/roles';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function WarehouseMobileOutgoingDetailPage({
    params,
}: PageProps) {
    const { id } = await params;
    const [result, attachmentsRes, session] = await Promise.all([
        getDeliveryOrderById(id),
        listWarehouseAttachments({ deliveryOrderId: id }),
        auth(),
    ]);

    if (!result?.success || !result.data) {
        // Legacy: id bisa berupa Sales Order (tautan lama). Desktop memakai
        // /warehouse/outgoing/orders/[id]; di mobile arahkan ke detail
        // field yang setara (route desktop tidak ada di mobile).
        const soResult = await getSalesOrderById(id);
        if (soResult?.success && soResult.data) {
            redirect(`/field/sales/orders/${id}`);
        }
        notFound();
    }

    const order = serializeData(result.data) as WarehouseOutgoingOrder;

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
        <WarehouseOutgoingDetailClient
            key={JSON.stringify([
                order.id,
                order.updatedAt,
                order.status,
                order.loadVerifiedAt,
                order.items,
                order.salesOrder?.items,
            ])}
            order={order}
            canReviseOrder={hasAnyRole(session?.user, [
                'ADMIN',
                'SALES',
                'MARKETING',
            ])}
            attachments={attachments}
        />
    );
}
