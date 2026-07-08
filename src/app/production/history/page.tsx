import { getProductionHistory } from '@/actions/production/production-execution';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History, Camera } from 'lucide-react';
import { ProductionHistoryClient } from '@/components/production/ProductionHistoryClient';

export const dynamic = 'force-dynamic';

export default async function ProductionHistoryPage() {
    const groupsRes = await getProductionHistory();
    const groups = groupsRes.success && groupsRes.data ? groupsRes.data : [];

    // Calculate stats
    const totalOrders = groups.length;
    const totalLogs = groups.reduce((sum: number, g: any) => sum + g.executions.length, 0);
    const totalYield = groups.reduce((sum: number, g: any) => sum + g.totalQuantity, 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-foreground">Log Hasil Produksi</h2>
                    <p className="text-muted-foreground">Dokumentasi output produksi per SPK.</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-4 flex flex-col items-center justify-center text-center">
                        <History className="h-8 w-8 text-zinc-600 opacity-80 mb-2" />
                        <div className="text-xl font-bold">{totalOrders}</div>
                        <p className="text-xs text-muted-foreground">Total SPK</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 flex flex-col items-center justify-center text-center">
                        <Camera className="h-8 w-8 text-emerald-600 opacity-80 mb-2" />
                        <div className="text-xl font-bold">{totalLogs}</div>
                        <p className="text-xs text-muted-foreground">Total Log Output</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 flex flex-col items-center justify-center text-center">
                        <div className="text-emerald-600 text-3xl font-bold mb-1">KG</div>
                        <div className="text-xl font-bold">{totalYield.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Total Yield</p>
                    </CardContent>
                </Card>
            </div>

            {/* Grouped Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Aktivitas Terbaru</CardTitle>
                </CardHeader>
                <CardContent>
                    <ProductionHistoryClient groups={groups} />
                </CardContent>
            </Card>
        </div>
    );
}
