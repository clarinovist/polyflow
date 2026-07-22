import {
    getInventoryStats,
    getLocations,
    getDashboardStats,
    getInventoryAsOf,
} from '@/actions/inventory/inventory';
import { ABCAnalysisService } from '@/services/inventory/abc-analysis-service';
import { canViewPrices } from '@/actions/admin/permissions';
import { InventoryWithRelations } from '@/types/inventory';
import { Card, CardContent } from '@/components/ui/card';
import { InventoryTable } from '@/components/warehouse/inventory/InventoryTable';
import type { InventoryItem } from '@/components/warehouse/inventory/inventory-table-types';
import { WarehouseNavigator } from '@/components/warehouse/inventory/WarehouseNavigator';

import { serializeData, toDecimalNumber } from '@/lib/utils/utils';
import { withTenantPage } from '@/lib/core/tenant';
import { InventoryQuickActions } from '@/components/warehouse/inventory/InventoryQuickActions';

const getAbcData = withTenantPage(async () => {
    return ABCAnalysisService.calculateABCClassification();
});

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
        liveInventoryRes,
        locationsRes,
        dashboardStatsRes,
    ] = await Promise.all([
        getInventoryStats(),
        getLocations(),
        getDashboardStats(),
    ]);

    const liveInventory = liveInventoryRes.success && liveInventoryRes.data ? liveInventoryRes.data : [];
    const locations = locationsRes.success && locationsRes.data ? locationsRes.data : [];
    const dashboardStats = dashboardStatsRes.success && dashboardStatsRes.data ? dashboardStatsRes.data : { totalStock: 0, lowStockCount: 0, totalValue: 0 };

    const showPricesRes = await canViewPrices();
    const showPrices = showPricesRes.success && showPricesRes.data ? showPricesRes.data : false;

    // Parse active location IDs (support multi-select)
    const activeLocationIds = params.locationId
        ? (Array.isArray(params.locationId) ? params.locationId : [params.locationId])
        : [];

    // Initialize table inventory with live data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tableInventory: any[] = liveInventory;

    if (asOfDate) {
        const historicalInventoryRes = await getInventoryAsOf(asOfDate);
        const historicalInventory = historicalInventoryRes.success && historicalInventoryRes.data ? historicalInventoryRes.data : [];
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
        const compInventoryRes = await getInventoryAsOf(compareDate);
        const compInventory = compInventoryRes.success && compInventoryRes.data ? compInventoryRes.data : [];
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
        const abcResults = await getAbcData();
        abcMap = abcResults.reduce((acc: Record<string, string>, item) => {
            acc[item.productVariantId] = item.class;
            return acc;
        }, {} as Record<string, string>);
    } catch (e) {
        console.error('Failed to calculate ABC:', e);
    }

    const tableVariantTotals = processedInventory.reduce((acc: Record<string, number>, item) => {
        const id = item.productVariantId;
        const qty = toDecimalNumber(item.quantity);
        acc[id] = (acc[id] || 0) + qty;
        return acc;
    }, {} as Record<string, number>);

    const isTableGlobalLowStock = (item: (InventoryWithRelations | SimplifiedInventory)) => {
        const liveItem = liveInventory.find(li => li.productVariantId === item.productVariantId);
        const threshold = toDecimalNumber(liveItem?.productVariant.minStockAlert);
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
        acc[id] = (acc[id] || 0) + toDecimalNumber(item.quantity);
        return acc;
    }, {} as Record<string, number>);

    const isLiveGlobalLowStock = (item: InventoryWithRelations) => {
        const threshold = toDecimalNumber(item.productVariant.minStockAlert);
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

    const displayedTotalStock = activeLocationIds.length > 0
        ? displayInventory.reduce((acc, item) => {
            const qty = toDecimalNumber(item.quantity);
            return acc + qty;
        }, 0)
        : dashboardStats.totalStock;

    const internalDisplayValue = displayInventory.reduce((acc, item) => {
        const qty = toDecimalNumber(item.quantity);
        const cost = toDecimalNumber(item.averageCost);
        return item.location?.locationType === 'CUSTOMER_OWNED' ? acc : acc + (qty * cost);
    }, 0);

    const customerOwnedDisplayValue = displayInventory.reduce((acc, item) => {
        const qty = toDecimalNumber(item.quantity);
        const cost = toDecimalNumber(item.averageCost);
        return item.location?.locationType === 'CUSTOMER_OWNED' ? acc + (qty * cost) : acc;
    }, 0);

    const serializedInventory = serializeData(displayInventory) as InventoryItem[];

    return (
        <div className="h-full flex flex-col space-y-4 overflow-hidden">
            <div className="flex items-end justify-between shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Stok</h1>
                    <p className="text-muted-foreground mt-1">Pantau level stok dan status gudang</p>
                </div>
                <InventoryQuickActions lowStockCount={dashboardStats.lowStockCount} />
            </div>

            <WarehouseNavigator
                locations={locationSummaries}
                activeLocationIds={activeLocationIds}
                totalSkus={liveInventory.length}
                totalLowStock={dashboardStats.lowStockCount}
                basePath="/warehouse/inventory"
            />

            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <Card className="border shadow-sm bg-card h-full flex flex-col overflow-hidden">
                    <CardContent suppressHydrationWarning className="p-0 flex-1 overflow-hidden">
                        <div className="h-full overflow-auto px-4 pb-4 pt-1">
                            <InventoryTable
                                inventory={serializedInventory}
                                variantTotals={tableVariantTotals}
                                comparisonData={comparisonData}
                                showComparison={!!compareDate}
                                initialDate={params.asOf}
                                initialCompareDate={params.compareWith}
                                showPrices={showPrices}
                                abcMap={abcMap}
                                totalStock={displayedTotalStock}
                                totalValue={internalDisplayValue}
                                customerOwnedValue={customerOwnedDisplayValue}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
