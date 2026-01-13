import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Button } from '@/components/ui/button';
import { Download, Calendar as CalendarIcon } from 'lucide-react';
import {
    getProductionRealizationReport,
    getMaterialUsageVarianceReport,
    getMachinePerformanceReport,
    getOperatorProductivityLeaderboard,
    getQualityControlSummary
} from '@/actions/analytics';
import { serializeData } from '@/lib/utils';
import AnalyticsTabs from './analytics-tabs';

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

                <div className="flex items-center gap-3">
                    {/* We might need a client component for Date Picker that pushes to URL */}
                    <div className="flex items-center gap-2 bg-background border rounded-md px-3 py-2 text-sm">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span>{dateRange.from.toLocaleDateString()} - {dateRange.to.toLocaleDateString()}</span>
                    </div>

                    <Button variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Export
                    </Button>
                </div>
            </div>

            <AnalyticsTabs
                defaultTab={params.tab || 'production'}
                data={{
                    productionRealization: serializeData(productionRealization),
                    materialVariance: serializeData(materialVariance),
                    machinePerformance: serializeData(machinePerformance),
                    operatorLeaderboard: serializeData(operatorLeaderboard),
                    qualitySummary: serializeData(qualitySummary)
                }}
                dateRange={dateRange}
            />
        </div>
    );
}
