import { getProductionAnalytics } from '@/actions/analytics';
import { AnalyticsToolbar } from '@/components/analytics/AnalyticsToolbar';
import { ProductionRealizationChart } from '@/components/analytics/ProductionRealizationChart';
import { MachinePerformanceCard } from '@/components/analytics/MachinePerformanceCard';
import { ScrapAnalysisChart } from '@/components/analytics/ScrapAnalysisChart';
import { OperatorLeaderboard } from '@/components/analytics/OperatorLeaderboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Factory, AlertTriangle, CheckCircle } from 'lucide-react';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function ProductionAnalyticsPage(props: { searchParams: SearchParams }) {
    const searchParams = await props.searchParams;
    const from = typeof searchParams.from === 'string' ? new Date(searchParams.from) : undefined;
    const to = typeof searchParams.to === 'string' ? new Date(searchParams.to) : undefined;

    const dateRange = from && to ? { from, to } : undefined;

    const data = await getProductionAnalytics(dateRange);

    // Calculate aggregated stats
    const avgYield = data.realization.reduce((acc, curr) => acc + curr.yieldRate, 0) / (data.realization.length || 1);
    const totalScrap = data.quality.scrapByReason.reduce((acc, curr) => acc + curr.quantity, 0);
    const passRate = data.quality.inspections.passRate;
    const activeMachines = data.machinePerformance.filter(m => m.totalOperatingHours > 0).length;

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Production Analytics</h1>
                <AnalyticsToolbar />
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg. Yield Rate</CardTitle>
                        <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{avgYield.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">
                            Across {data.realization.length} orders
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">QC Pass Rate</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{passRate.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">
                            {data.quality.inspections.total} inspections
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Scrap</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{totalScrap.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            Units rejected
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Machines</CardTitle>
                        <Factory className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeMachines}</div>
                        <p className="text-xs text-muted-foreground">
                            With logged hours
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <ProductionRealizationChart data={data.realization} />
                <MachinePerformanceCard data={data.machinePerformance} />
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ScrapAnalysisChart data={data.quality} />
                <OperatorLeaderboard data={data.operatorProductivity} />
            </div>
        </div>
    );
}
