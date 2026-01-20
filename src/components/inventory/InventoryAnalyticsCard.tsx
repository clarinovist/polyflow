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
        <Card className={cn("overflow-hidden", className)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                <div className="p-2 bg-primary/10 rounded-full">
                    {icon}
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                {(description || trend) && (
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
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
