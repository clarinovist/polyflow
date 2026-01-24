import { StockAgingService } from '@/services/stock-aging-service';
import { StockAgingTable } from '@/components/warehouse/inventory/StockAgingTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, RefreshCw, Clock } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/utils';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Stock Aging | PolyFlow Warehouse',
};

export default async function WarehouseStockAgingPage() {
    const agingData = await StockAgingService.calculateStockAging();
    const summary = await StockAgingService.getAgingSummary();

    return (
        <div className="p-8 pt-6 max-w-[1600px] mx-auto space-y-6">
            <Card className="border shadow-sm overflow-hidden">
                <CardHeader className="bg-muted/30 border-b py-3 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-orange-50 text-orange-600">
                            <Clock className="h-4 w-4" />
                        </div>
                        <div>
                            <CardTitle className="text-lg font-bold text-slate-900">Stock Aging Report</CardTitle>
                            <p className="text-xs text-muted-foreground">Analyze inventory age based on batch receiving dates</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" asChild className="h-8 w-8">
                            <Link href="/warehouse/inventory/aging" title="Refresh">
                                <RefreshCw className="h-3.5 w-3.5" />
                            </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild className="h-8 text-xs">
                            <Link href="/warehouse/inventory">
                                <ArrowLeft className="mr-2 h-3 w-3" /> Back to Inventory
                            </Link>
                        </Button>
                    </div>
                </CardHeader>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Inventory Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(summary.totalValue)}</div>
                    </CardContent>
                </Card>
                <Card className={summary.agedPercentage > 10 ? "border-red-200 bg-red-50 dark:bg-red-950/20 shadow-sm" : "border shadow-sm"}>
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
                <Card className="border shadow-sm">
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
