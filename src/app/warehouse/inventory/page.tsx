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
import { ContextualHelp } from '@/components/support/contextual-help';

const getAbcData = withTenantPage(async () => {
    return ABCAnalysisService.calculateABCClassification();
});

/**
 * Table rows are either live inventory (Decimal quantity) or historical/as-of
 * rows where quantity is recomputed to a plain number. This covers both.
 */
type TableInventoryItem = Omit<InventoryWithRelations, 'quantity'> & {
    quantity: InventoryWithRelations['quantity'] | number;
};

export default async function WarehouseInventoryPage({
    searchParams,
}: {
    searchParams: Promise<{
        locationId?: string | string[];
        type?: string;
        lowStock?: string;
        asOf?: string;
        compareWith?: string;
    }>;
}) {
    const params = await searchParams;
    const asOfDate = params.asOf ? new Date(params.asOf) : null;
    const compareDate = params.compareWith
        ? new Date(params.compareWith)
        : null;

    // Fetch data in parallel
    const [liveInventoryRes, locationsRes, dashboardStatsRes] =
        await Promise.all([
            getInventoryStats(),
            getLocations(),
            getDashboardStats(),
        ]);

    const liveInventory =
        liveInventoryRes.success && liveInventoryRes.data
            ? liveInventoryRes.data
            : [];
    const locations =
        locationsRes.success && locationsRes.data ? locationsRes.data : [];
    const dashboardStats =
        dashboardStatsRes.success && dashboardStatsRes.data
            ? dashboardStatsRes.data
            : { totalStock: 0, lowStockCount: 0, totalValue: 0 };

    const showPricesRes = await canViewPrices();
    const showPrices =
        showPricesRes.success && showPricesRes.data
            ? showPricesRes.data
            : false;

    // Parse active location IDs (support multi-select)
    const activeLocationIds = params.locationId
        ? Array.isArray(params.locationId)
            ? params.locationId
            : [params.locationId]
        : [];

    let dataError =
        !liveInventoryRes.success || !locationsRes.success
            ? 'Gagal memuat stok atau lokasi. Coba muat ulang; saldo belum dapat ditampilkan.'
            : undefined;
    let comparisonError: string | undefined;
    const validDate = (value?: string) =>
        !value ||
        (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
            !Number.isNaN(new Date(value).getTime()) &&
            new Date(value).toISOString().slice(0, 10) === value);
    if (!validDate(params.asOf))
        dataError = 'Tanggal stok tidak valid. Pilih ulang tanggal.';

    let tableInventory: TableInventoryItem[] = liveInventory;

    if (asOfDate && !dataError) {
        const historicalInventoryRes = await getInventoryAsOf(asOfDate);
        const historicalInventory =
            historicalInventoryRes.success && historicalInventoryRes.data
                ? historicalInventoryRes.data
                : [];
        if (!historicalInventoryRes.success)
            dataError =
                'Gagal memuat stok historis. Coba lagi; saldo tidak dianggap nol.';
        tableInventory = liveInventory.map((item) => {
            const histItem = historicalInventory.find(
                (h) =>
                    h.productVariantId === item.productVariantId &&
                    h.locationId === item.locationId,
            );
            return {
                ...item,
                quantity: histItem ? histItem.quantity : 0,
                reservedQuantity: undefined,
                waitingQuantity: undefined,
                availableQuantity: undefined,
                averageCost: null,
            };
        });
    }

    const comparisonData: Record<string, number> = {};
    if (!validDate(params.compareWith))
        comparisonError = 'Tanggal pembanding tidak valid.';
    if (compareDate && !comparisonError) {
        const compInventoryRes = await getInventoryAsOf(compareDate);
        const compInventory =
            compInventoryRes.success && compInventoryRes.data
                ? compInventoryRes.data
                : [];
        if (!compInventoryRes.success)
            comparisonError =
                'Gagal memuat pembanding. Selisih tidak ditampilkan.';
        compInventory.forEach((item) => {
            const key = `${item.productVariantId}-${item.locationId}`;
            comparisonData[key] = item.quantity;
        });
    }

    let processedInventory = tableInventory;
    if (activeLocationIds.length > 0) {
        processedInventory = tableInventory.filter((item) =>
            activeLocationIds.includes(item.locationId),
        );
    }

    let abcMap: Record<string, string> | undefined;
    try {
        if (!asOfDate) {
            const abcResults = await getAbcData();
            abcMap = abcResults.reduce(
                (acc: Record<string, string>, item) => {
                    acc[item.productVariantId] = item.class;
                    return acc;
                },
                {} as Record<string, string>,
            );
        }
    } catch (e) {
        console.error('Failed to calculate ABC:', e);
    }

    const tableVariantTotals = processedInventory.reduce(
        (acc: Record<string, number>, item) => {
            const id = item.productVariantId;
            const qty = toDecimalNumber(item.quantity);
            acc[id] = (acc[id] || 0) + qty;
            return acc;
        },
        {} as Record<string, number>,
    );

    const isTableGlobalLowStock = (item: TableInventoryItem) => {
        const liveItem = liveInventory.find(
            (li) => li.productVariantId === item.productVariantId,
        );
        const threshold = toDecimalNumber(
            liveItem?.productVariant.minStockAlert,
        );
        if (!threshold) return false;
        return tableVariantTotals[item.productVariantId] < threshold;
    };

    let displayInventory = processedInventory;
    const isLowStockFilter = params.lowStock === 'true';

    if (isLowStockFilter) {
        displayInventory = displayInventory.filter(isTableGlobalLowStock);
    }

    const liveVariantTotals = liveInventory.reduce(
        (acc: Record<string, number>, item: InventoryWithRelations) => {
            const id = item.productVariantId;
            acc[id] = (acc[id] || 0) + toDecimalNumber(item.quantity);
            return acc;
        },
        {} as Record<string, number>,
    );

    const isLiveGlobalLowStock = (item: InventoryWithRelations) => {
        const threshold = toDecimalNumber(item.productVariant.minStockAlert);
        if (!threshold) return false;
        return liveVariantTotals[item.productVariantId] < threshold;
    };

    const locationSummaries = locations.map((loc) => {
        const locInventory = liveInventory.filter(
            (item) => item.locationId === loc.id,
        );
        const lowStockCount = locInventory.filter(isLiveGlobalLowStock).length;

        return {
            ...loc,
            totalSkus: locInventory.length,
            lowStockCount,
        };
    });

    const displayedTotalStock =
        activeLocationIds.length > 0
            ? displayInventory.reduce((acc, item) => {
                  const qty = toDecimalNumber(item.quantity);
                  return acc + qty;
              }, 0)
            : dashboardStats.totalStock;

    const internalDisplayValue = displayInventory.reduce((acc, item) => {
        const qty = toDecimalNumber(item.quantity);
        const cost = toDecimalNumber(item.averageCost);
        return item.location?.locationType === 'CUSTOMER_OWNED'
            ? acc
            : acc + qty * cost;
    }, 0);

    const customerOwnedDisplayValue = displayInventory.reduce((acc, item) => {
        const qty = toDecimalNumber(item.quantity);
        const cost = toDecimalNumber(item.averageCost);
        return item.location?.locationType === 'CUSTOMER_OWNED'
            ? acc + qty * cost
            : acc;
    }, 0);

    const activeParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (Array.isArray(value))
            value.forEach((entry) => activeParams.append(key, entry));
        else if (value) activeParams.set(key, value);
    });
    activeParams.delete('asOf');
    activeParams.delete('compareWith');
    const liveHref = `/warehouse/inventory?${activeParams}`;
    activeParams.set('lowStock', 'true');
    const lowStockHref = `/warehouse/inventory?${activeParams}`;

    const serializedInventory = serializeData(
        displayInventory,
    ) as InventoryItem[];

    return (
        <div className="min-w-0 flex flex-col space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Stok</h1>
                    <p className="text-muted-foreground mt-1">
                        Pantau level stok dan status gudang
                    </p>
                </div>
                <div className="flex flex-wrap min-w-0 items-center gap-2">
                    <ContextualHelp
                        title="Panduan Stok"
                        prefillQuestion="Kenapa stok produk tidak cukup saat confirm SO?"
                        links={[
                            {
                                title: 'Cara Cek Stok Per Lokasi',
                                slug: 'cara-cek-stok-per-lokasi',
                            },
                            {
                                title: 'Cara Terima Barang Gudang',
                                slug: 'cara-terima-barang-gudang',
                            },
                            {
                                title: 'Error Backflush / Stok Bahan',
                                slug: 'error-backflush-atau-stok-bahan',
                            },
                        ]}
                    />
                    <InventoryQuickActions
                        lowStockCount={
                            asOfDate || !dashboardStatsRes.success
                                ? undefined
                                : dashboardStats.lowStockCount
                        }
                        historical={!!asOfDate}
                        liveHref={liveHref}
                        lowStockHref={lowStockHref}
                    />
                </div>
            </div>

            <WarehouseNavigator
                locations={locationSummaries}
                activeLocationIds={activeLocationIds}
                totalSkus={liveInventory.length}
                totalLowStock={dashboardStats.lowStockCount}
                basePath="/warehouse/inventory"
                historical={!!asOfDate || !!dataError}
            />

            <Card className="flex-1 min-h-0 border shadow-sm bg-card py-0 gap-0">
                <CardContent suppressHydrationWarning className="p-0 h-full">
                    <InventoryTable
                        inventory={dataError ? [] : serializedInventory}
                        dataError={dataError}
                        comparisonError={comparisonError}
                        variantTotals={tableVariantTotals}
                        comparisonData={comparisonData}
                        showComparison={!!compareDate && !comparisonError}
                        initialDate={params.asOf}
                        initialCompareDate={params.compareWith}
                        showPrices={showPrices}
                        abcMap={abcMap}
                        totalStock={displayedTotalStock}
                        totalValue={
                            showPrices && !asOfDate
                                ? internalDisplayValue
                                : undefined
                        }
                        customerOwnedValue={
                            showPrices && !asOfDate
                                ? customerOwnedDisplayValue
                                : undefined
                        }
                    />
                </CardContent>
            </Card>
        </div>
    );
}
