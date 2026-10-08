import { History } from 'lucide-react';
import { EntityStatusTimeline } from '@/components/shared/EntityStatusTimeline';

interface PurchaseOrderAuditDisclosureProps {
    orderId: string;
    status: string;
}

export function PurchaseOrderAuditDisclosure({
    orderId,
    status,
}: PurchaseOrderAuditDisclosureProps) {
    return (
        <details className="group rounded-xl border bg-card shadow-sm">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 py-4 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <History className="h-4 w-4" />
                Audit Status
                <span className="ml-auto text-sm font-normal text-muted-foreground group-open:hidden">
                    Tampilkan riwayat
                </span>
                <span className="ml-auto hidden text-sm font-normal text-muted-foreground group-open:inline">
                    Sembunyikan riwayat
                </span>
            </summary>
            <div className="border-t p-4">
                <EntityStatusTimeline
                    key={status}
                    entityType="PurchaseOrder"
                    entityId={orderId}
                />
            </div>
        </details>
    );
}
