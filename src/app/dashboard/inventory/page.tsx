import { getInventoryStats, getLocations, getInventoryAsOf } from '@/actions/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Warehouse, Box, LayoutGrid, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { InventoryTable } from '@/components/inventory/InventoryTable';

import { format } from 'date-fns';

export default async function InventoryDashboard({
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

    let [liveInventory, locations] = await Promise.all([
        getInventoryStats(),
        getLocations(),
    ]);

    // Initialize table inventory with live data
    let tableInventory = liveInventory;

    // Phase 1: Historical Data Logic (Only affects Table)
    if (asOfDate) {
        const historicalInventory = await getInventoryAsOf(asOfDate);

        // Map historical quantities to a new tableInventory array
        tableInventory = liveInventory.map(item => {
            const histItem = historicalInventory.find(
                h => h.productVariantId === item.productVariantId && h.locationId === item.locationId
            );
            return {
                ...item,
                quantity: histItem ? new (item.quantity as any).constructor(histItem.quantity) : new (item.quantity as any).constructor(0)
            };
        });
    }

    // Phase 2: Comparison logic (Only affects Table)
    let comparisonData: Record<string, number> = {};
    if (compareDate) {
        const compInventory = await getInventoryAsOf(compareDate);
        compInventory.forEach(item => {
            comparisonData[`${item.productVariantId}-${item.locationId}`] = item.quantity;
        });
    }

    const isLowStockFilter = params.lowStock === 'true';

    // --- LOGIC A: SUMMARY CARDS (ALWAYS LIVE) ---
    // Calculate global totals for live data to determine low stock status for summary cards
    const liveVariantTotals = liveInventory.reduce((acc: Record<string, number>, item: any) => {
        const id = item.productVariantId;
        acc[id] = (acc[id] || 0) + item.quantity.toNumber();
        return acc;
    }, {} as Record<string, number>);

    const isLiveGlobalLowStock = (item: any) => {
        const threshold = item.productVariant.minStockAlert?.toNumber();
        if (!threshold) return false;
        return liveVariantTotals[item.productVariantId] < threshold;
    };

    const locationSummaries = locations.map((loc: any) => {
        const locInventory = liveInventory.filter((item: any) => item.locationId === loc.id);
        const lowStockCount = locInventory.filter(isLiveGlobalLowStock).length;

        return {
            ...loc,
            totalSkus: locInventory.length,
            lowStockCount,
        };
    });

    // --- LOGIC B: TABLE (RESPECTS DATE) ---
    // Calculate totals for table data (historical or live)
    const tableVariantTotals = tableInventory.reduce((acc: Record<string, number>, item: any) => {
        const id = item.productVariantId;
        acc[id] = (acc[id] || 0) + item.quantity.toNumber();
        return acc;
    }, {} as Record<string, number>);

    // Helper for table filtering
    const isTableGlobalLowStock = (item: any) => {
        const threshold = item.productVariant.minStockAlert?.toNumber();
        if (!threshold) return false;
        return tableVariantTotals[item.productVariantId] < threshold;
    };

    // Filter table inventory
    let displayInventory = params.locationId
        ? tableInventory.filter((item: any) => item.locationId === params.locationId)
        : tableInventory;

    if (isLowStockFilter) {
        displayInventory = displayInventory.filter(isTableGlobalLowStock);
    }

    const activeLocation = locations.find((l: any) => l.id === params.locationId);

    // Serialize Decimal fields for client component
    const serializedInventory = JSON.parse(
        JSON.stringify(displayInventory, (key, value) => {
            // Convert Decimal to number
            if (value && typeof value === 'object' && value.constructor?.name === 'Decimal') {
                return parseFloat(value.toString());
            }
            return value;
        })
    );


    return (
        <div className="p-6 space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Inventory Overview</h1>
                    <p className="text-slate-600 mt-2">Monitor stock levels across all warehouse locations</p>
                </div>
            </div>

            {/* Warehouse Summary Cards (Always Live) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Link href="/dashboard/inventory" className="block">
                    <Card className={`h-full transition-all hover:ring-2 hover:ring-primary/50 cursor-pointer ${!params.locationId ? 'ring-2 ring-primary bg-primary/5' : ''}`}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">All Warehouses</CardTitle>
                            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent suppressHydrationWarning>
                            <div className="text-2xl font-bold">{liveInventory.length} Positions</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {liveInventory.filter(isLiveGlobalLowStock).length} Low Stock Alerts (Live)
                            </p>
                        </CardContent>
                    </Card>
                </Link>

                {locationSummaries.map((loc) => (
                    <Link key={loc.id} href={`/dashboard/inventory?locationId=${loc.id}`} className="block">
                        <Card className={`h-full transition-all hover:ring-2 hover:ring-primary/50 cursor-pointer ${params.locationId === loc.id ? 'ring-2 ring-primary bg-primary/5' : ''}`}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{loc.name}</CardTitle>
                                <Warehouse className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent suppressHydrationWarning>
                                <div className="text-2xl font-bold">{loc.totalSkus} SKUs</div>
                                <div className="flex items-center gap-2 mt-1">
                                    <p className={`text-xs ${loc.lowStockCount > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                                        {loc.lowStockCount} Low Stock
                                    </p>
                                    <span className="text-muted-foreground text-xs">•</span>
                                    <p className="text-xs text-muted-foreground">
                                        Active
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>


            <Card className="border-none shadow-sm bg-white">
                <CardHeader className="border-b bg-slate-50/50">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <Box className="h-5 w-5 text-slate-600" />
                            {activeLocation ? `Stock Positions in ${activeLocation.name}` : "Global Stock Positions"}
                            {asOfDate && (
                                <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    Viewing History: {format(asOfDate, 'MMM d, yyyy')}
                                </Badge>
                            )}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <Link
                                href={`/dashboard/inventory${params.locationId ? `?locationId=${params.locationId}` : ''}${!isLowStockFilter ? (params.locationId ? '&' : '?') + 'lowStock=true' : ''}`}
                            >
                                <Badge
                                    variant={isLowStockFilter ? "destructive" : "outline"}
                                    className="cursor-pointer hover:bg-red-100 transition-colors py-1.5 px-3"
                                >
                                    <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
                                    {isLowStockFilter ? "Low Stock Only" : "Filter Low Stock"}
                                </Badge>
                            </Link>
                        </div>
                    </div>
                </CardHeader>
                <CardContent suppressHydrationWarning className="p-6">
                    <InventoryTable
                        inventory={serializedInventory}
                        variantTotals={tableVariantTotals}
                        comparisonData={comparisonData}
                        showComparison={!!compareDate}
                        initialDate={params.asOf}
                        initialCompareDate={params.compareWith}
                    />
                </CardContent>
            </Card>
        </div>
    );
}

