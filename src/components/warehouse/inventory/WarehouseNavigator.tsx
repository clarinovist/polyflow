'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Warehouse, AlertCircle } from 'lucide-react';
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
    totalSkus: _totalSkus,
    totalLowStock: _totalLowStock,
    basePath = '/warehouse/inventory'
}: WarehouseNavigatorProps) {
    return (
        <Card className="h-full border-none shadow-none bg-transparent flex flex-col overflow-hidden">
            <div className="flex-col h-full flex">
                <div className="shrink-0 mb-4">
                    <h3 className="text-lg font-semibold mb-1">Warehouses</h3>
                    <p className="text-sm text-muted-foreground">Select specific locations to filter view</p>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-2 min-h-0">
                    {/* Individual Warehouses */}
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
                            <Link key={location.id} href={href} className="block">
                                <div
                                    className={cn(
                                        "flex items-center justify-between p-3 rounded-lg border transition-all hover:bg-muted/50",
                                        isActive
                                            ? "bg-primary/10 border-primary/50 shadow-sm ring-1 ring-primary/20 dark:bg-primary/20 dark:border-primary/40"
                                            : "bg-card border-border"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "p-2 rounded-md",
                                            isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                                        )}>
                                            <Warehouse className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm">{location.name}</p>
                                            <p className="text-xs text-muted-foreground">{location.totalSkus} SKUs</p>
                                        </div>
                                    </div>
                                    {location.lowStockCount > 0 && (
                                        <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-red-500/20 bg-red-500/10 text-red-600 flex items-center gap-1">
                                            <AlertCircle className="h-3 w-3" />
                                            {location.lowStockCount}
                                        </Badge>
                                    )}
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </Card>
    );
}
