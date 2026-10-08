import {
    AlertCircle,
    CheckCircle2,
    Circle,
    ClipboardCheck,
} from 'lucide-react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import type { AttachmentItem } from '@/components/warehouse/WarehouseAttachmentPanel';
import type { DeliveryOrderDetailData } from './types';

interface DeliveryReadinessCardProps {
    order: DeliveryOrderDetailData;
    isLoadVerified: boolean;
    attachments: AttachmentItem[];
}

type ReadinessTone = 'complete' | 'warning' | 'neutral';

function ReadinessRow({
    label,
    detail,
    tone,
}: {
    label: string;
    detail: string;
    tone: ReadinessTone;
}) {
    const Icon =
        tone === 'complete'
            ? CheckCircle2
            : tone === 'warning'
              ? AlertCircle
              : Circle;
    const iconClass =
        tone === 'complete'
            ? 'text-emerald-600 dark:text-emerald-400'
            : tone === 'warning'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground';
    return (
        <li className="flex gap-3">
            <Icon
                className={"mt-0.5 h-4 w-4 shrink-0 " + iconClass}
                aria-hidden="true"
            />
            <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-sm text-muted-foreground">{detail}</p>
            </div>
        </li>
    );
}

export function DeliveryReadinessCard({
    order,
    isLoadVerified,
    attachments,
}: DeliveryReadinessCardProps) {
    const loadNeedsAttention = order.status === 'LOADING' && !isLoadVerified;
    const receiverDetail = order.receivedBy
        ? ' · ' + order.receivedBy
        : '';

    return (
        <Card aria-label="Kelengkapan pengiriman">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardCheck className="h-4 w-4" />
                    Kelengkapan Pengiriman
                </CardTitle>
                <CardDescription>
                    Status bukti dan verifikasi operasional.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ul className="space-y-4">
                    <ReadinessRow
                        label="Verifikasi muat"
                        detail={
                            isLoadVerified
                                ? 'Sudah dikunci'
                                : loadNeedsAttention
                                  ? 'Wajib dikunci sebelum dikirim'
                                  : ['SHIPPED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'RETURNED'].includes(order.status)
                                    ? 'Verifikasi tidak tercatat'
                                    : 'Belum dikunci'
                        }
                        tone={
                            isLoadVerified
                                ? 'complete'
                                : loadNeedsAttention
                                  ? 'warning'
                                  : 'neutral'
                        }
                    />
                    <ReadinessRow
                        label="Foto truk"
                        detail={
                            order.vehiclePhotoUrl
                                ? 'Sudah tersedia'
                                : 'Belum diunggah · opsional'
                        }
                        tone={
                            order.vehiclePhotoUrl ? 'complete' : 'neutral'
                        }
                    />
                    <ReadinessRow
                        label="Bukti terima"
                        detail={
                            order.proofOfDeliveryUrl
                                ? 'Sudah tersedia' + receiverDetail
                                : ['ARRIVED', 'DELIVERED'].includes(order.status)
                                  ? 'Belum diunggah · opsional'
                                  : 'Menunggu tahap penerimaan'
                        }
                        tone={
                            order.proofOfDeliveryUrl
                                ? 'complete'
                                : 'neutral'
                        }
                    />
                    <ReadinessRow
                        label="Bukti operasional"
                        detail={
                            attachments.length > 0
                                ? attachments.length + ' lampiran tersedia'
                                : 'Belum ada lampiran · opsional'
                        }
                        tone={
                            attachments.length > 0 ? 'complete' : 'neutral'
                        }
                    />
                </ul>
            </CardContent>
        </Card>
    );
}
