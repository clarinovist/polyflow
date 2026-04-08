'use client';

import { Badge } from '@/components/ui/badge';
import { Warehouse } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils/utils';

interface LocationSummary {
    id: string;
    name: string;
    totalSkus: number;
    lowStockCount: number;
    locationType?: string;
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
                                    : location.locationType === 'CUSTOMER_OWNED'
                                        ? "bg-purple-50 hover:bg-purple-100/70 border-purple-200 text-purple-800 dark:bg-purple-900/20 dark:border-purple-700 dark:text-purple-300"
                                        : "bg-card hover:bg-muted/50 border-border text-muted-foreground"
                            )}
                        >
                            <span>{location.name}</span>
                            {location.locationType === 'CUSTOMER_OWNED' && !isActive && (
                                <span className="text-[9px] font-bold uppercase tracking-wider bg-purple-200 text-purple-800 dark:bg-purple-800/40 dark:text-purple-200 px-1.5 py-0.5 rounded-full">
                                    Customer
                                </span>
                            )}
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
