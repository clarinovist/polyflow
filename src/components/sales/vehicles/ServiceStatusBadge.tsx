import { Badge } from '@/components/ui/badge';
import { SERVICE_STATUS_LABELS, type ServiceStatus } from '@/lib/sales/vehicle-service';
import type { FleetServiceAlert } from '@/services/sales/vehicle-service-service';

const STATUS_STYLES: Record<ServiceStatus, string> = {
    AMAN: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
    SEGERA: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
    LEWAT: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
    BELUM_ADA_DATA: 'border-border bg-muted text-muted-foreground',
};

export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
    return <Badge variant="outline" className={`whitespace-normal ${STATUS_STYLES[status]}`}>{SERVICE_STATUS_LABELS[status]}</Badge>;
}

/** One badge per item that is SEGERA or LEWAT, e.g. "Oli mesin: sisa 320 km". Renders nothing when empty. */
export function ServiceAlertBadges({ items }: { items: FleetServiceAlert['items'] }) {
    if (!items.length) return null;
    return <ul aria-label="Pengingat servis" className="flex flex-wrap gap-1.5">
        {items.map((item) => <li key={item.itemId}>
            <Badge variant="outline" className={`whitespace-normal break-words ${STATUS_STYLES[item.status]}`}>
                {item.label}{item.remainingText ? `: ${item.remainingText}` : ''}
            </Badge>
        </li>)}
    </ul>;
}
