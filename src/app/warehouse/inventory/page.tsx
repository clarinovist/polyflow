import {
    getInventoryStats,
    getLocations,
    getDashboardStats,
    getInventoryAsOf,
} from '@/actions/inventory';
import { ABCAnalysisService } from '@/services/abc-analysis-service';
import { canViewPrices } from '@/actions/permissions';
import { InventoryWithRelations } from '@/types/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InventoryTable, InventoryItem } from '@/components/warehouse/inventory/InventoryTable';
import { WarehouseNavigator } from '@/components/warehouse/inventory/WarehouseNavigator';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Box, PackageCheck, DollarSign, Warehouse } from 'lucide-react';
import { serializeData, formatRupiah } from '@/lib/utils';

interface SimplifiedInventory {
    productVariantId: string;
    locationId: string;
    quantity: number;
}

export default async function WarehouseInventoryPage({
    searchParams,
}: {
    searchParams: Promise<{
        locationId?: string;
        type?: string;
        lowStock?: string;
        asOf?: string;
        compareWith?: string;
    }>;
}) {
    const params = await searchParams;
    const asOfDate = params.asOf ? new Date(params.asOf) : null;
    const compareDate = params.compareWith ? new Date(params.compareWith) : null;

    // Fetch data in parallel
    const [
        liveInventory,
        locations,
        dashboardStats,
    ] = await Promise.all([
        getInventoryStats(),
        getLocations(),
        getDashboardStats(),
    ]);

    const showPrices = await canViewPrices();

    // Parse active location IDs (support multi-select)
    const activeLocationIds = params.locationId
        ? (Array.isArray(params.locationId) ? params.locationId : [params.locationId])
        : [];

    const activeLocation = activeLocationIds.length === 1
        ? locations.find((l) => l.id === activeLocationIds[0])
        : null;

    // Initialize table inventory with live data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tableInventory: any[] = liveInventory;

    if (asOfDate) {
        const historicalInventory = await getInventoryAsOf(asOfDate);
        tableInventory = liveInventory.map(item => {
            const histItem = historicalInventory.find(
                h => h.productVariantId === item.productVariantId && h.locationId === item.locationId
            );
            return {
                ...item,
                quantity: histItem ? histItem.quantity : 0
            };
        });
    }

    const comparisonData: Record<string, number> = {};
    if (compareDate) {
        const compInventory = await getInventoryAsOf(compareDate);
        compInventory.forEach(item => {
            const key = `${item.productVariantId}-${item.locationId}`;
            comparisonData[key] = item.quantity;
        });
    }

    let processedInventory = tableInventory;
    if (activeLocationIds.length > 0) {
        processedInventory = tableInventory.filter(item => activeLocationIds.includes(item.locationId));
    }

    let abcMap: Record<string, string> | undefined;
    try {
        const abcResults = await ABCAnalysisService.calculateABCClassification();
        abcMap = abcResults.reduce((acc: Record<string, string>, item) => {
            acc[item.productVariantId] = item.class;
            return acc;
        }, {} as Record<string, string>);
    } catch (e) {
        console.error('Failed to calculate ABC:', e);
    }

    const tableVariantTotals = processedInventory.reduce((acc: Record<string, number>, item) => {
        const id = item.productVariantId;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const qty = typeof item.quantity === 'number' ? item.quantity : (item.quantity as any).toNumber();
        acc[id] = (acc[id] || 0) + qty;
        return acc;
    }, {} as Record<string, number>);

    const isTableGlobalLowStock = (item: (InventoryWithRelations | SimplifiedInventory)) => {
        const liveItem = liveInventory.find(li => li.productVariantId === item.productVariantId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const threshold = (liveItem?.productVariant.minStockAlert as any)?.toNumber();
        if (!threshold) return false;
        return tableVariantTotals[item.productVariantId] < threshold;
    };

    let displayInventory = processedInventory;
    const isLowStockFilter = params.lowStock === 'true';

    if (isLowStockFilter) {
        displayInventory = displayInventory.filter(isTableGlobalLowStock);
    }

    const liveVariantTotals = liveInventory.reduce((acc: Record<string, number>, item: InventoryWithRelations) => {
        const id = item.productVariantId;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        acc[id] = (acc[id] || 0) + (typeof item.quantity === 'number' ? item.quantity : (item.quantity as any).toNumber());
        return acc;
    }, {} as Record<string, number>);

    const isLiveGlobalLowStock = (item: InventoryWithRelations) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const threshold = (item.productVariant.minStockAlert as any)?.toNumber();
        if (!threshold) return false;
        return liveVariantTotals[item.productVariantId] < threshold;
    };

    const locationSummaries = locations.map((loc) => {
        const locInventory = liveInventory.filter((item) => item.locationId === loc.id);
        const lowStockCount = locInventory.filter(isLiveGlobalLowStock).length;

        return {
            ...loc,
            totalSkus: locInventory.length,
            lowStockCount,
        };
    });

    let pageTitle = "Global Stock Positions";
    if (activeLocationIds.length === 1) {
        pageTitle = `Stock in ${activeLocation?.name || 'Warehouse'}`;
    } else if (activeLocationIds.length > 1) {
        pageTitle = `Stock in ${activeLocationIds.length} Locations`;
    }

    const displayedTotalStock = activeLocationIds.length > 0
        ? displayInventory.reduce((acc, item) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const qty = typeof item.quantity === 'number' ? item.quantity : (item.quantity as any).toNumber();
            return acc + qty;
        }, 0)
        : dashboardStats.totalStock;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const liveTotalValue = (displayInventory as any[]).reduce((acc, item) => {
        const qty = typeof item.quantity === 'number' ? item.quantity : item.quantity.toNumber();
        const price = item.productVariant.price ? (typeof item.productVariant.price === 'number' ? item.productVariant.price : item.productVariant.price.toNumber()) : 0;
        return acc + (qty * price);
    }, 0);

    const serializedInventory = serializeData(displayInventory) as InventoryItem[];

    return (
        <div className="h-full flex flex-col space-y-4 p-6 overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Warehouse className="h-3 w-3" />
                        <span>Warehouse / Stock Overview</span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">Inventory Control</h1>
                    <p className="text-muted-foreground mt-1">Monitor stock levels and warehouse status</p>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-6 flex-1 overflow-hidden min-h-0">
                <div className="col-span-12 lg:col-span-3 h-full overflow-hidden">
                    <div className="h-full overflow-hidden min-h-0">
                        <WarehouseNavigator
                            locations={locationSummaries}
                            activeLocationIds={activeLocationIds}
                            totalSkus={liveInventory.length}
                            totalLowStock={dashboardStats.lowStockCount}
                            basePath="/warehouse/inventory"
                        />
                    </div>
                </div>

                <div className="col-span-12 lg:col-span-9 h-full flex flex-col overflow-hidden">
                    <Card className="border shadow-sm bg-card h-full flex flex-col overflow-hidden">
                        <CardHeader className="border-b bg-muted/30 py-4 shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                                        <Box className="h-4 w-4 text-muted-foreground" />
                                        {pageTitle}
                                    </CardTitle>
                                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 flex items-center gap-1.5 px-2.5 py-1">
                                        <PackageCheck className="h-3.5 w-3.5" />
                                        <span className="font-semibold">{displayedTotalStock.toLocaleString()}</span>
                                        <span className="text-emerald-600/80 dark:text-emerald-400/80 font-normal ml-1">total stock</span>
                                    </Badge>

                                    {showPrices && (
                                        <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 flex items-center gap-1.5 px-2.5 py-1">
                                            <DollarSign className="h-3.5 w-3.5" />
                                            <span className="font-semibold">{formatRupiah(liveTotalValue)}</span>
                                            <span className="text-blue-600/80 dark:text-blue-400/80 font-normal ml-1">total value</span>
                                        </Badge>
                                    )}
                                </div>
                                {asOfDate && (
                                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                                        <AlertCircle className="h-3 w-3 mr-1" />
                                        History: {format(asOfDate, 'MMM d, yyyy')}
                                    </Badge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent suppressHydrationWarning className="p-0 flex-1 overflow-hidden">
                            <div className="h-full overflow-auto p-4">
                                <InventoryTable
                                    inventory={serializedInventory}
                                    variantTotals={tableVariantTotals}
                                    comparisonData={comparisonData}
                                    showComparison={!!compareDate}
                                    initialDate={params.asOf}
                                    initialCompareDate={params.compareWith}
                                    showPrices={showPrices}
                                    abcMap={abcMap}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
