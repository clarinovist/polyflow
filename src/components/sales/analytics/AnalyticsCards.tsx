import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SalesMetrics } from '@/actions/analytics';
import { formatRupiah } from '@/lib/utils';
import { DollarSign, ShoppingCart, TrendingUp } from 'lucide-react';

interface AnalyticsCardsProps {
    data: SalesMetrics;
}

export function AnalyticsCards({ data }: AnalyticsCardsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-3">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{formatRupiah(data.totalRevenue)}</div>
                    <p className="text-xs text-muted-foreground">
                        Last 30 days
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{data.totalOrders}</div>
                    <p className="text-xs text-muted-foreground">
                        Last 30 days
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg. Order Value</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{formatRupiah(data.averageOrderValue)}</div>
                    <p className="text-xs text-muted-foreground">
                        Last 30 days
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
