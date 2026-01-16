

import { AnalyticsToolbar } from '@/components/analytics/AnalyticsToolbar';
import {
    getProductionRealizationReport,
    getMaterialUsageVarianceReport,
    getMachinePerformanceReport,
    getOperatorProductivityLeaderboard,
    getQualityControlSummary
} from '@/actions/analytics';
import { serializeData } from '@/lib/utils';
import AnalyticsTabs from './analytics-tabs';
import {
    ProductionRealizationItem,
    MaterialUsageVarianceItem,
    MachinePerformanceItem,
    OperatorProductivityItem,
    QualityControlSummary,
} from '@/types/analytics';

// Helper to get date range from params or default to current month
function getDateRange(searchParams: { from?: string; to?: string }) {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const from = searchParams.from ? new Date(searchParams.from) : firstDay;
    const to = searchParams.to ? new Date(searchParams.to) : lastDay;

    return { from, to };
}

export default async function AnalyticsPage({
    searchParams,
}: {
    searchParams: Promise<{ from?: string; to?: string; tab?: string }>;
}) {
    const params = await searchParams;
    const dateRange = getDateRange(params);

    // Fetch all data in parallel
    const [
        productionRealization,
        materialVariance,
        machinePerformance,
        operatorLeaderboard,
        qualitySummary
    ] = await Promise.all([
        getProductionRealizationReport(dateRange),
        getMaterialUsageVarianceReport(dateRange),
        getMachinePerformanceReport(dateRange),
        getOperatorProductivityLeaderboard(dateRange),
        getQualityControlSummary(dateRange)
    ]);

    return (
        <div className="p-6 md:p-8 space-y-8 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground tracking-tight">Analytics & Reports</h1>
                    <p className="text-muted-foreground mt-1">
                        Performance insights for {dateRange.from.toLocaleDateString()} - {dateRange.to.toLocaleDateString()}
                    </p>
                </div>

                <AnalyticsToolbar
                    dateRange={{ from: dateRange.from.toISOString(), to: dateRange.to.toISOString() }}
                    data={{
                        productionRealization: serializeData(productionRealization) as unknown as ProductionRealizationItem[],
                        materialVariance: serializeData(materialVariance) as unknown as MaterialUsageVarianceItem[],
                        machinePerformance: serializeData(machinePerformance) as unknown as MachinePerformanceItem[],
                        operatorLeaderboard: serializeData(operatorLeaderboard) as unknown as OperatorProductivityItem[],
                        qualitySummary: serializeData(qualitySummary) as unknown as QualityControlSummary
                    }}
                    activeTab={params.tab || 'production'}
                />
            </div>

            <AnalyticsTabs
                defaultTab={params.tab || 'production'}
                data={{
                    productionRealization: serializeData(productionRealization) as unknown as ProductionRealizationItem[],
                    materialVariance: serializeData(materialVariance) as unknown as MaterialUsageVarianceItem[],
                    machinePerformance: serializeData(machinePerformance) as unknown as MachinePerformanceItem[],
                    operatorLeaderboard: serializeData(operatorLeaderboard) as unknown as OperatorProductivityItem[],
                    qualitySummary: serializeData(qualitySummary) as unknown as QualityControlSummary
                }}
                dateRange={{ from: dateRange.from.toISOString(), to: dateRange.to.toISOString() }}
            />
        </div>
    );
}
