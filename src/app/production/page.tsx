import { getProductionLiveOverview } from '@/actions/dashboard/production-live-overview';
import { ProductionOverviewClient } from '@/components/production/overview/ProductionOverviewClient';
import { PageHeader } from '@/components/ui/page-header';

export const dynamic = 'force-dynamic';

export default async function ProductionDashboardPage() {
    const liveOverviewRes = await getProductionLiveOverview();
    const liveData = liveOverviewRes.success && liveOverviewRes.data 
        ? liveOverviewRes.data 
        : {
            pulse: {
                outputToday: 0,
                outputYesterday: 0,
                targetToday: 0,
                runRateLastHour: 0,
                activeJobs: 0,
                released: 0,
                waiting: 0,
                yieldToday: 0,
                scrapToday: 0,
                qcPassRateToday: 100,
                downtimeOpenCount: 0
            },
            hourly: Array.from({ length: 24 }, (_, i) => ({ hour: i, today: 0, avg7d: 0 })),
            machines: [],
            attentions: [],
            runningOrders: [],
            shiftsToday: [
                { name: 'Pagi', output: 0, operators: 0, scrap: 0 },
                { name: 'Siang', output: 0, operators: 0, scrap: 0 },
                { name: 'Malam', output: 0, operators: 0, scrap: 0 }
            ]
        };

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Lantai Produksi — Command Center"
                description="Pemantauan run-rate, kondisi mesin, shift, dan kendala produksi secara real-time."
            />
            <ProductionOverviewClient initialData={liveData} />
        </div>
    );
}
