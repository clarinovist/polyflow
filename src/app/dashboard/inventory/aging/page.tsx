import { StockAgingService } from '@/services/stock-aging-service';
import { StockAgingTable } from '@/components/inventory/StockAgingTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/utils';

export default async function StockAgingPage() {
    // 1. Fetch Aging Data
    const agingData = await StockAgingService.calculateStockAging();
    const summary = await StockAgingService.getAgingSummary();

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/dashboard/inventory">
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Inventory
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Stock Aging Report</h1>
                        <p className="text-muted-foreground">Analyze inventory age based on batch receiving dates.</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                    <Link href="/dashboard/inventory/aging">
                        <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                    </Link>
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Inventory Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(summary.totalValue)}</div>
                    </CardContent>
                </Card>
                <Card className={summary.agedPercentage > 10 ? "border-red-200 bg-red-50 dark:bg-red-950/20" : ""}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-red-600 dark:text-red-400">Value &gt; 90 Days</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                            {formatRupiah(summary.agedValue)}
                        </div>
                        <p className="text-xs text-red-600/80 mt-1">
                            {summary.agedPercentage.toFixed(1)}% of total value
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Action Items</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-sm text-muted-foreground">
                            Consider discounting or promoting items with high &gt;90 day stock to free up capital.
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Table */}
            <StockAgingTable data={agingData} />
        </div>
    );
}
