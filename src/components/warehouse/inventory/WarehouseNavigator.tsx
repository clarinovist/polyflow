'use client';

import { Badge } from '@/components/ui/badge';
import { Warehouse } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LocationSummary {
    id: string;
    name: string;
    totalSkus: number;
    lowStockCount: number;
}

interface WarehouseNavigatorProps {
    locations: LocationSummary[];
    activeLocationIds: string[];
    totalSkus: number;
    totalLowStock: number;
    basePath?: string;
}

export function WarehouseNavigator({
    locations,
    activeLocationIds,
    totalSkus,
    totalLowStock: _totalLowStock,
    basePath = '/warehouse/inventory'
}: WarehouseNavigatorProps) {
    const isAllActive = activeLocationIds.length === 0;

    return (
        <div className="flex flex-wrap items-center gap-2 pb-4 shrink-0">
            {/* All Warehouses Pill */}
            <Link href={basePath}>
                <div
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-full border transition-all text-sm font-medium whitespace-nowrap",
                        isAllActive
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-card hover:bg-muted/50 border-border text-muted-foreground"
                    )}
                >
                    <Warehouse className="h-4 w-4" />
                    <span>All Warehouses</span>
                    <Badge
                        variant={isAllActive ? "secondary" : "outline"}
                        className={cn("px-1.5 h-5 min-w-[1.25rem] justify-center flex", isAllActive ? "bg-primary-foreground/20 text-primary-foreground border-none" : "")}
                    >
                        {totalSkus}
                    </Badge>
                </div>
            </Link>

            {/* Individual Warehouse Pills */}
            {locations.map((location) => {
                const isActive = activeLocationIds.includes(location.id);

                // Toggle Logic
                let newIds: string[];
                if (isActive) {
                    newIds = activeLocationIds.filter(id => id !== location.id);
                } else {
                    newIds = [...activeLocationIds, location.id];
                }

                const href = newIds.length === 0
                    ? basePath
                    : `${basePath}?${newIds.map(id => `locationId=${id}`).join('&')}`;

                return (
                    <Link key={location.id} href={href}>
                        <div
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-full border transition-all text-sm font-medium whitespace-nowrap",
                                isActive
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "bg-card hover:bg-muted/50 border-border text-muted-foreground"
                            )}
                        >
                            <span>{location.name}</span>
                            <div className="flex items-center gap-1">
                                <Badge
                                    variant={isActive ? "secondary" : "outline"}
                                    className={cn("px-1.5 h-5 min-w-[1.25rem] justify-center flex", isActive ? "bg-primary-foreground/20 text-primary-foreground border-none" : "")}
                                >
                                    {location.totalSkus}
                                </Badge>
                                {location.lowStockCount > 0 && (
                                    <Badge className="bg-red-500 text-white border-none px-1.5 h-5 min-w-[1.25rem] justify-center flex shadow-sm animate-pulse">
                                        {location.lowStockCount}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
