import { PurchaseService } from '@/services/purchasing/purchase-service';
import { getLocations } from '@/actions/inventory/inventory';
import { listWarehouseAttachments } from '@/actions/warehouse/operational-attachments';
import { serializeData } from '@/lib/utils/utils';
import { notFound } from 'next/navigation';
import { MobileReceiptClient } from './MobileReceiptClient';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function WarehouseMobileIncomingDetailPage({
    params,
}: PageProps) {
    const { id } = await params;

    const [po, locationsRes, attachmentsRes] = await Promise.all([
        PurchaseService.getPurchaseOrderById(id),
        getLocations(),
        listWarehouseAttachments({ purchaseOrderId: id }),
    ]);

    if (!po) {
        notFound();
    }

    const order = serializeData(po) as {
        id: string;
        orderNumber: string;
        orderDate: string;
        expectedDate: string | null;
        supplier: { name: string };
        items: {
            id: string;
            productVariantId: string;
            quantity: number;
            receivedQty: number;
            enteredUnit?: string;
            productVariant: {
                name: string;
                skuCode: string;
                primaryUnit: string;
            };
        }[];
    };

    const locations =
        locationsRes.success && locationsRes.data
            ? locationsRes.data.map((l: { id: string; name: string }) => ({
                  id: l.id,
                  name: l.name,
              }))
            : [];

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

    return <MobileReceiptClient order={order} locations={locations} attachments={attachments} />;
}
