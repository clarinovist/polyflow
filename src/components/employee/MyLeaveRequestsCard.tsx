import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { countLeaveDays } from '@/lib/hrd/leave-presets';
import { leaveStatusLabel } from '@/lib/hrd/attendance-status-label';
import { toBusinessDateString } from '@/lib/utils/timezone';

export interface MyLeaveRequestRow {
    id: string;
    startDate: Date;
    endDate: Date;
    reason: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reviewNotes: string | null;
}

const STATUS_CLASS: Record<MyLeaveRequestRow['status'], string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-emerald-100 text-emerald-700',
    REJECTED: 'bg-rose-100 text-rose-700',
};

function formatShort(date: Date): string {
    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Jakarta',
    });
}

function describeRange(row: MyLeaveRequestRow): string {
    const days = countLeaveDays(
        toBusinessDateString(row.startDate),
        toBusinessDateString(row.endDate),
    );
    const start = formatShort(row.startDate);
    const label = days > 1 ? `${start} – ${formatShort(row.endDate)}` : start;
    return `${label} · ${days} hari`;
}

function describeReason(row: MyLeaveRequestRow): string {
    const reason = row.reason ?? '-';
    if (row.status === 'REJECTED' && row.reviewNotes) {
        return `${reason} · "${row.reviewNotes}"`;
    }
    return reason;
}

export function MyLeaveRequestsCard({
    requests,
}: {
    requests: ReadonlyArray<MyLeaveRequestRow>;
}) {
    if (requests.length === 0) return null;

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-xs">Pengajuan Izin Saya</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <div className="divide-y">
                    {requests.map((r) => (
                        <div key={r.id} className="p-3 flex justify-between">
                            <div>
                                <div className="text-xs font-medium">
                                    {describeRange(r)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {describeReason(r)}
                                </div>
                            </div>
                            <div
                                className={`text-xs px-2 py-0.5 rounded-full inline-block self-start ${STATUS_CLASS[r.status]}`}
                            >
                                {leaveStatusLabel(r.status)}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
