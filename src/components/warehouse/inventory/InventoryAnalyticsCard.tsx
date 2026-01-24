'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface InventoryAnalyticsCardProps {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    description?: string;
    trend?: {
        value: number;
        isPositive: boolean;
        label: string;
    };
    loading?: boolean;
    className?: string;
}

export function InventoryAnalyticsCard({
    title,
    value,
    icon,
    description,
    trend,
    loading,
    className
}: InventoryAnalyticsCardProps) {
    if (loading) {
        return (
            <Card className={cn("overflow-hidden", className)}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                        <Skeleton className="h-4 w-[100px]" />
                    </CardTitle>
                    <Skeleton className="h-4 w-4 rounded-full" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-8 w-[60px] mb-2" />
                    <Skeleton className="h-3 w-[120px]" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn("overflow-hidden hover:bg-muted/5 transition-colors", className)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 pt-3 px-4">
                <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    {title}
                </CardTitle>
                <div className="p-1.5 bg-primary/10 rounded-lg shrink-0">
                    {icon}
                </div>
            </CardHeader>
            <CardContent className="pb-3 px-4">
                <div className="text-xl font-bold tracking-tight">{value}</div>
                {(description || trend) && (
                    <div className="text-[10.5px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        {trend && (
                            <span className={cn(
                                "font-medium",
                                trend.isPositive ? "text-emerald-600" : "text-rose-600"
                            )}>
                                {trend.isPositive ? '+' : ''}{trend.value}% {trend.label}
                            </span>
                        )}
                        {description && <span>{description}</span>}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
