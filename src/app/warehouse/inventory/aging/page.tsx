import { StockAgingService } from '@/services/inventory/stock-aging-service';
import { StockAgingTable } from '@/components/warehouse/inventory/StockAgingTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Clock } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatRupiah, formatQuantity } from '@/lib/utils/utils';
import { Metadata } from 'next';
import { withTenantPage } from '@/lib/core/tenant';

const getAgingData = withTenantPage(async () => {
    const aging = await StockAgingService.calculateStockAging();
    const summary = await StockAgingService.getAgingSummary();
    return { aging, summary };
});

export const metadata: Metadata = {
    title: 'Stock Aging | PolyFlow Warehouse',
};

export default async function StockAgingPage() {
    const { aging: agingData, summary } = await getAgingData();

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/warehouse/inventory">
                            <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Inventaris
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Aging Stok</h1>
                        <p className="text-muted-foreground">Analisis umur stok berdasarkan hari</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Terakhir diperbarui: {new Date().toLocaleDateString('id-ID')}</span>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Item</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatQuantity(summary.totalItems)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Nilai</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(summary.totalValue)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Stok Aging (&gt;90 hari)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{formatQuantity(summary.slowMovingCount)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Rata-rata Umur</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary.avgDays.toFixed(0)} hari</div>
                    </CardContent>
                </Card>
            </div>

            {/* Aging Table */}
            <StockAgingTable data={agingData} />
        </div>
    );
}
