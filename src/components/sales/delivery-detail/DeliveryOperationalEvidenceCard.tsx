import type { DeliveryOrderDetailData } from './types';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import {
    WarehouseAttachmentPanel,
    type AttachmentItem,
} from '@/components/warehouse/WarehouseAttachmentPanel';

interface DeliveryOperationalEvidenceCardProps {
    order: DeliveryOrderDetailData;
    safeAttachments: AttachmentItem[];
    router: { refresh: () => void };
}

export function DeliveryOperationalEvidenceCard({
    order,
    safeAttachments,
    router,
}: DeliveryOperationalEvidenceCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Bukti Operasional</CardTitle>
                <CardDescription>
                    Foto dan dokumen opsional terkait proses muat/bongkar
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    <WarehouseAttachmentPanel
                        entityId={order.id}
                        entityLabel={order.orderNumber}
                        entityType="deliveryOrderId"
                        checkpoint="LOAD"
                        attachments={safeAttachments.filter(
                            (a) => a.checkpoint === 'LOAD',
                        )}
                        disabled={
                            order.status === 'DELIVERED' ||
                            order.status === 'CANCELLED' ||
                            order.status === 'RETURNED'
                        }
                        onAttachmentChange={() => router.refresh()}
                    />
                    <WarehouseAttachmentPanel
                        entityId={order.id}
                        entityLabel={order.orderNumber}
                        entityType="deliveryOrderId"
                        checkpoint="DAMAGE"
                        attachments={safeAttachments.filter(
                            (a) => a.checkpoint === 'DAMAGE',
                        )}
                        disabled={
                            order.status === 'DELIVERED' ||
                            order.status === 'CANCELLED' ||
                            order.status === 'RETURNED'
                        }
                        onAttachmentChange={() => router.refresh()}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
