import { getHrdMobileOverview } from '@/actions/hrd/mobile-dashboard';
import { DashboardSectionState } from '@/components/dashboard/DashboardMetricPrimitives';
import { MobileDataFreshness, MobileSectionHeader } from '@/components/mobile';
import { MobileReadError } from '@/components/mobile/MobileReadError';

export default async function HrdTasksPage() {
    const response = await getHrdMobileOverview();
    if (!response.success)
        return <MobileReadError title="Daftar cuti belum tersedia" />;

    const { generatedAt, attention } = response.data;
    return (
        <div className="space-y-4">
            <MobileSectionHeader title="Pengajuan Cuti Pending" level={1} />
            <MobileDataFreshness generatedAt={generatedAt} />
            {attention.pendingLeave.status === 'AVAILABLE' ? (
                <section className="space-y-3 rounded-xl border bg-card p-4">
                    <p className="text-sm text-muted-foreground">
                        {attention.pendingLeave.data.count} pengajuan menunggu
                        persetujuan. Ringkasan mobile tidak memuat baris atau
                        identitas karyawan.
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Persetujuan tetap dilakukan melalui workbench desktop
                        HRD oleh pengguna yang memiliki akses ke modul Cuti.
                    </p>
                </section>
            ) : (
                <DashboardSectionState
                    state="UNAVAILABLE"
                    title="Hitungan pengajuan cuti tidak tersedia"
                    description="Kegagalan baca tidak dianggap sebagai antrean kosong."
                />
            )}
        </div>
    );
}
