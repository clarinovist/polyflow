import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TopSupplierItem } from '@/types/analytics';
import { formatRupiah } from '@/lib/utils/utils';
import { analyticsLabels } from '@/lib/labels';
import { Progress } from '@/components/ui/progress';

interface TopSuppliersCardProps {
    data: TopSupplierItem[];
}

export function TopSuppliersCard({ data }: TopSuppliersCardProps) {
    if (!data.length) return (
        <Card>
            <CardHeader>
                <CardTitle>{analyticsLabels.topSuppliers}</CardTitle>
                <CardDescription>{analyticsLabels.topSuppliersDesc}</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground py-8 text-center">{analyticsLabels.noData}</p>
            </CardContent>
        </Card>
    );

    const maxSpend = Math.max(...data.map(d => d.totalSpend));

    return (
        <Card>
            <CardHeader>
                <CardTitle>{analyticsLabels.topSuppliers}</CardTitle>
                <CardDescription>{analyticsLabels.topSuppliersDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {data.map((item, i) => (
                    <div key={i} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <div className="font-medium truncate max-w-[180px]" title={item.supplierName}>
                                {item.supplierName}
                            </div>
                            <div className="font-bold">{formatRupiah(item.totalSpend)}</div>
                        </div>
                        <Progress value={(item.totalSpend / maxSpend) * 100} className="h-2" />
                        <div className="text-xs text-muted-foreground text-right">
                            {item.orderCount} orders
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
