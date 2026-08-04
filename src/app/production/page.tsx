import { getProductionLiveOverview } from '@/actions/dashboard/production-live-overview';
import { getProductionAlertThresholdsForPage } from '@/actions/production/alert-threshold-settings';
import {
    DEFAULT_PRODUCTION_ALERT_THRESHOLDS,
    type ProductionAlertThresholds,
} from '@/lib/production/alert-thresholds';
import {
    ProductionOverviewClient,
    emptyOverviewData,
    type ProductionOverviewData,
} from '@/components/production/overview/ProductionOverviewClient';
import { PageHeader } from '@/components/ui/page-header';

export const dynamic = 'force-dynamic';

export default async function ProductionDashboardPage() {
    const [liveOverviewRes, thresholdsRes] = await Promise.all([
        getProductionLiveOverview(),
        getProductionAlertThresholdsForPage(),
    ]);
    const liveData: ProductionOverviewData =
        liveOverviewRes.success && liveOverviewRes.data
            ? (liveOverviewRes.data as unknown as ProductionOverviewData)
            : emptyOverviewData();
    const thresholds: ProductionAlertThresholds = thresholdsRes.success
        ? thresholdsRes.data
        : { ...DEFAULT_PRODUCTION_ALERT_THRESHOLDS };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Hari Ini — Produksi"
                description="Pulse lantai + antrean kerja shift."
            />
            <ProductionOverviewClient
                initialData={liveData}
                thresholds={thresholds}
            />
        </div>
    );
}
