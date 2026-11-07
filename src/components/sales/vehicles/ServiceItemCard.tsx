import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ServiceItemView, ServiceRecordView } from '@/services/sales/vehicle-service-service';
import { ServiceStatusBadge } from './ServiceStatusBadge';

const formatKm = (value: number) => `${value.toLocaleString('id-ID')} km`;
const formatDay = (instant: string) => new Date(instant).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium' });

function Summary({ item }: { item: ServiceItemView }) {
    if (item.status === 'BELUM_ADA_DATA') return <p className="text-sm text-muted-foreground">Belum ada data. Catat servis terakhir sebagai titik awal.</p>;
    return <p className="text-sm break-words">
        {item.label} — {item.remainingText}
        {item.dueKm !== null && ` (jatuh tempo di ${formatKm(item.dueKm)}`}
        {item.dueDate !== null && `${item.dueKm !== null ? ', ' : ' ('}atau ${formatDay(item.dueDate)}`}
        {item.dueKm !== null && ')'}
    </p>;
}

function terms(item: ServiceItemView): string {
    const parts = [`Interval ${formatKm(item.intervalKm)}`];
    if (item.intervalDays !== null) parts.push(`atau ${item.intervalDays} hari`);
    parts.push(`peringatan ${formatKm(item.warnKm)} sebelumnya`);
    return parts.join(' · ');
}

function History({ records, onCorrect }: { records: ServiceRecordView[]; onCorrect: (record: ServiceRecordView) => void }) {
    if (!records.length) return null;
    return <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 underline underline-offset-4">Riwayat servis ({records.length})</summary>
        <ul className="divide-y">
            {records.map((record) => <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="break-words">{formatDay(record.servicedAt)} · {formatKm(record.odometerKm)}{record.note ? ` · ${record.note}` : ''}</span>
                <Button type="button" size="sm" variant="outline" className="min-h-11" aria-label={`Koreksi servis ${formatDay(record.servicedAt)}`} onClick={() => onCorrect(record)}>Koreksi</Button>
            </li>)}
        </ul>
    </details>;
}

interface Props {
    item: ServiceItemView;
    onRecord: (item: ServiceItemView) => void;
    onEdit: (item: ServiceItemView) => void;
    onCorrect: (item: ServiceItemView, record: ServiceRecordView) => void;
}

export function ServiceItemCard({ item, onRecord, onEdit, onCorrect }: Props) {
    return <li className="space-y-2 rounded-lg border p-3" aria-label={`Servis ${item.label}`}>
        <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium break-words">{item.label}</h3>
            <ServiceStatusBadge status={item.status} />
            {!item.isActive && <Badge variant="secondary">Nonaktif</Badge>}
        </div>
        {item.isActive && <Summary item={item} />}
        <p className="text-xs text-muted-foreground">{terms(item)}</p>
        <div className="flex flex-wrap gap-2">
            {item.isActive && <Button type="button" className="min-h-11" onClick={() => onRecord(item)}>Catat servis</Button>}
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onEdit(item)}>Ubah interval</Button>
        </div>
        <History records={item.records} onCorrect={(record) => onCorrect(item, record)} />
    </li>;
}
