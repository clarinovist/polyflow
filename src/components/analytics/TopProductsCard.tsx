'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TopProductItem } from '@/types/analytics';
import { formatRupiah } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface TopProductsCardProps {
    data: TopProductItem[];
}

export function TopProductsCard({ data }: TopProductsCardProps) {
    if (!data.length) return null;

    const maxRevenue = Math.max(...data.map(d => d.totalRevenue));

    return (
        <Card>
            <CardHeader>
                <CardTitle>Top Products</CardTitle>
                <CardDescription>By revenue this month</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {data.map((item, i) => (
                    <div key={i} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <div className="font-medium truncate max-w-[180px]" title={item.productName}>
                                {item.productName}
                            </div>
                            <div className="font-bold">{formatRupiah(item.totalRevenue)}</div>
                        </div>
                        <Progress value={(item.totalRevenue / maxRevenue) * 100} className="h-2" />
                        <div className="text-xs text-muted-foreground text-right">
                            {item.totalQuantity} units sold
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
