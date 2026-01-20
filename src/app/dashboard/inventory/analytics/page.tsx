import {
    getInventoryTurnover,
    getDaysOfInventoryOnHand,
    getStockMovementTrends
} from '@/actions/inventory';
import { InventoryAnalyticsCard } from '@/components/inventory/InventoryAnalyticsCard';
import { StockMovementTrendsChart } from '@/components/inventory/StockMovementTrendsChart';
import { Activity, CalendarClock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function InventoryAnalyticsPage() {
    // Fetch data in parallel
    const [
        turnoverStats,
        dohStats,
        movementTrends
    ] = await Promise.all([
        getInventoryTurnover(),
        getDaysOfInventoryOnHand(),
        getStockMovementTrends()
    ]);

    return (
        <div className="h-[calc(100vh-2rem)] flex flex-col space-y-6 p-6 overflow-hidden">
            {/* Page Header */}
            <div className="flex items-center gap-4 shrink-0">
                <Button variant="outline" size="icon" asChild>
                    <Link href="/dashboard/inventory">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Inventory Analytics</h1>
                    <p className="text-muted-foreground mt-1">Deep dive into stock performance and trends</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
                <InventoryAnalyticsCard
                    title="Turnover Ratio"
                    value={turnoverStats.turnoverRatio}
                    icon={<Activity className="h-4 w-4 text-primary" />}
                    description={`Over last ${turnoverStats.periodDays} days`}
                    trend={{ value: 0, isPositive: true, label: 'vs last period' }} // Placeholder
                />
                <InventoryAnalyticsCard
                    title="Days on Hand"
                    value={dohStats.daysOnHand.toFixed(1)}
                    icon={<CalendarClock className="h-4 w-4 text-primary" />}
                    description="Estimated depletion time"
                    trend={{ value: 0, isPositive: false, label: 'vs last period' }} // Placeholder
                />
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
                <div className="h-full pb-6">
                    <StockMovementTrendsChart data={movementTrends} />
                </div>
            </div>
        </div>
    );
}
