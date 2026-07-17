import { getProductionLiveOverview } from '@/actions/dashboard/production-live-overview';
import {
  ProductionOverviewClient,
  emptyOverviewData,
  type ProductionOverviewData,
} from '@/components/production/overview/ProductionOverviewClient';
import { PageHeader } from '@/components/ui/page-header';

export const dynamic = 'force-dynamic';

export default async function ProductionDashboardPage() {
  const liveOverviewRes = await getProductionLiveOverview();
  const liveData: ProductionOverviewData =
    liveOverviewRes.success && liveOverviewRes.data
      ? (liveOverviewRes.data as unknown as ProductionOverviewData)
      : emptyOverviewData();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lantai Produksi — Pulse Hari Ini"
        description="Posisi per proses (Mixing / Extrusion / Packing). Command center tetap di Manajemen Lantai."
      />
      <ProductionOverviewClient initialData={liveData} />
    </div>
  );
}
