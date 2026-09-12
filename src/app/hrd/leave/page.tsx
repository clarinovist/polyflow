import { LeaveRequestsManager } from '@/components/hrd/LeaveRequestsManager';
import { CalendarDays } from 'lucide-react';

const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
type LeaveStatus = (typeof LEAVE_STATUSES)[number];

function isLeaveStatus(value: string | undefined): value is LeaveStatus {
    return LEAVE_STATUSES.some((status) => status === value);
}

export default async function LeavePage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string; requestId?: string }>;
}) {
    const params = await searchParams;
    const initialStatus = isLeaveStatus(params.status)
        ? params.status
        : undefined;
    const initialRequestId = params.requestId?.trim() || undefined;
    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <CalendarDays className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight uppercase">
                        Cuti &amp; Izin
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Pengajuan dan persetujuan cuti karyawan
                    </p>
                </div>
            </div>
            <LeaveRequestsManager
                initialStatus={initialStatus}
                initialRequestId={initialRequestId}
            />
        </div>
    );
}
