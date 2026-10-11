import { getProductionLiveOverview } from '@/actions/dashboard/production-live-overview';
import {
    ProductionOverviewClient,
    type ProductionOverviewData,
} from '@/components/production/overview/ProductionOverviewClient';
import { DashboardSectionState } from '@/components/dashboard/DashboardMetricPrimitives';
import { PageHeader } from '@/components/ui/page-header';

export const dynamic = 'force-dynamic';

export default async function ProductionDashboardPage() {
    const result = await getProductionLiveOverview();
    const data =
        result.success && result.data
            ? (result.data as unknown as ProductionOverviewData)
            : null;

    if (!data || data.state !== 'AVAILABLE' || !data.health) {
        return (
            <div className="flex min-w-0 flex-col gap-6">
                <PageHeader
                    title="Hari Ini — Produksi"
                    description="Kondisi, perhatian, dan arah utama operasional produksi."
                />
                <DashboardSectionState
                    state="UNAVAILABLE"
                    title="Dashboard Production tidak tersedia"
                    description="Data awal gagal dimuat. Angka kosong tidak dianggap nol; coba muat ulang setelah akses atau layanan pulih."
                />
            </div>
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-6">
            <PageHeader
                title="Hari Ini — Produksi"
                description="Kondisi, perhatian, dan arah utama operasional produksi."
            />
            <ProductionOverviewClient initialData={data} />
        </div>
    );
}
