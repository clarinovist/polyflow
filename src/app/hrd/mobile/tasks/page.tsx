import { getHrdMobileOverview } from '@/actions/hrd/mobile-dashboard';
import { MobileSectionHeader } from '@/components/mobile';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { formatWIB } from '@/lib/utils/timezone';

export default async function HrdTasksPage() {
    const response = await getHrdMobileOverview();
    if (!response.success) return <MobileReadError title="Daftar cuti belum tersedia" />;
    const { pendingLeaves, highlights } = response.data;
    return (
        <div className="space-y-4">
            <MobileSectionHeader title="Pengajuan Cuti Pending" level={1} />
            <p className="text-sm text-muted-foreground">{highlights.pendingLeaveCount} pengajuan menunggu. Menampilkan maksimal 10 pengajuan terbaru. Persetujuan tetap melalui desktop HRD.</p>
            {!pendingLeaves.length ? <p className="py-4 text-sm">Tidak ada pengajuan cuti pending.</p> : pendingLeaves.map((leave) => (
                <article key={leave.id} className="space-y-2 rounded-xl border bg-card p-4 [overflow-wrap:anywhere]">
                    <h2 className="font-semibold">{leave.employeeName}</h2>
                    <p className="text-sm">{leave.leaveType}</p>
                    <p className="text-sm">{formatWIB(new Date(leave.startDate), 'dd/MM/yyyy')} – {formatWIB(new Date(leave.endDate), 'dd/MM/yyyy')}</p>
                    <p className="text-sm text-muted-foreground">Menunggu persetujuan</p>
                </article>
            ))}
        </div>
    );
}
