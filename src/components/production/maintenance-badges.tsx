import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/utils';

export const MAINTENANCE_STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Draft',
    PENDING: 'Menunggu persetujuan',
    APPROVED: 'Siap dikerjakan',
    IN_PROGRESS: 'Sedang dikerjakan',
    DONE: 'Selesai',
    REJECTED: 'Ditolak',
    CANCELLED: 'Dibatalkan',
};

export const MAINTENANCE_URGENCY_LABELS: Record<string, string> = {
    LOW: 'Rendah',
    NORMAL: 'Normal',
    URGENT: 'Mendesak',
};

const STATUS_STYLES: Record<string, string> = {
    DRAFT: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
    PENDING:
        'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300',
    APPROVED:
        'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300',
    IN_PROGRESS:
        'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-300',
    DONE: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300',
    REJECTED:
        'border-red-200 bg-red-50 text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300',
    CANCELLED:
        'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const URGENCY_STYLES: Record<string, string> = {
    LOW: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
    NORMAL:
        'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300',
    URGENT:
        'border-red-200 bg-red-50 text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300',
};

export function MaintenanceStatusBadge({ status }: { status: string }) {
    return (
        <Badge
            variant="outline"
            className={cn('shadow-none', STATUS_STYLES[status])}
        >
            {MAINTENANCE_STATUS_LABELS[status] ?? status}
        </Badge>
    );
}

export function MaintenanceUrgencyBadge({ urgency }: { urgency: string }) {
    return (
        <Badge
            variant="outline"
            className={cn('shadow-none', URGENCY_STYLES[urgency])}
        >
            {MAINTENANCE_URGENCY_LABELS[urgency] ?? urgency}
        </Badge>
    );
}

export function formatMaintenanceDate(value: string | Date): string {
    return new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Jakarta',
    }).format(new Date(value));
}

export function formatMaintenanceAge(value: string | Date): string {
    const minutes = Math.max(
        0,
        Math.floor((Date.now() - new Date(value).getTime()) / 60_000),
    );
    if (minutes < 60) return minutes + ' menit';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' jam';
    return Math.floor(hours / 24) + ' hari';
}
