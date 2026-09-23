import Link from 'next/link';
import type { FleetSummary } from '@/services/sales/fleet-summary-service';
import { formatFleetDate, formatFleetKm, kirStatus } from '@/lib/sales/fleet-summary';
import { Badge } from '@/components/ui/badge';

export function KirBadge({ expiry }: { expiry: string | null }) {
    const status = kirStatus(expiry);
    const styles = {
        unknown: 'border-border bg-muted text-muted-foreground',
        expired: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
        due: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
        valid: 'border-border bg-muted text-foreground',
    };
    return <Badge variant="outline" className={`whitespace-normal ${styles[status.tone]}`}>{status.label}</Badge>;
}

export function FleetReading({ reading }: { reading: FleetSummary['latestReading'] }) {
    if (!reading) return <p className="text-sm text-muted-foreground">Odometer belum tercatat</p>;
    return <div className="space-y-1 text-sm">
        <p className="font-medium tabular-nums">Odometer {formatFleetKm(reading.km)}</p>
        <p className="text-xs text-muted-foreground">Dicatat {formatFleetDate(reading.recordedAt)} WIB</p>
        <Link className="text-xs underline underline-offset-4" href={`/sales/delivery-schedules/${reading.scheduleId}`}>
            {reading.source === 'TRIP_START' ? 'Odometer berangkat' : 'Odometer kembali'} · {reading.scheduleNumber}
        </Link>
    </div>;
}

export function FleetMileageSummary({ summary }: { summary: FleetSummary | undefined }) {
    if (!summary) return <p className="text-sm text-muted-foreground">Ringkasan KM tidak tersedia</p>;
    return <div className="space-y-2 min-w-48">
        <FleetReading reading={summary.latestReading} />
        <div className="border-t pt-2 text-sm">
            <p className="font-medium">KM trip: {formatFleetKm(summary.actualKm)}</p>
            <p className="text-xs text-muted-foreground">{summary.recordedTrips} rit lengkap · {summary.pendingTrips} belum lengkap</p>
            {summary.undatedTrips > 0 && <p className="text-xs text-muted-foreground">{summary.undatedTrips} rit tanpa tanggal, di luar total bulan</p>}
        </div>
    </div>;
}
