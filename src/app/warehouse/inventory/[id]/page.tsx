import { getStockLedgerAction, getLocations } from '@/actions/inventory/inventory';
import { getProduct360Overview } from '@/actions/inventory/product-360';
import { serializeData } from '@/lib/utils/utils';
import { notFound } from 'next/navigation';
import type { ComponentProps } from 'react';
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { Product360Tabs } from '@/components/warehouse/360/Product360Tabs';
import type { StockLedgerClient } from '@/components/warehouse/StockLedgerClient';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ startDate?: string; endDate?: string; locationId?: string; tab?: string }>;
}

export default async function StockLedgerPage({ params, searchParams }: PageProps) {
    const { id } = await params;
    const { startDate, endDate, locationId, tab } = await searchParams;

    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const [ledgerDataRes, locationsRes, overviewRes] = await Promise.all([
        getStockLedgerAction(
            id,
            startDate ? startOfDay(new Date(startDate)) : defaultStart,
            endDate ? endOfDay(new Date(endDate)) : defaultEnd,
            locationId === 'all' ? undefined : locationId
        ).catch((error) => {
            console.error('Error fetching stock ledger:', error);
            return null;
        }),
        getLocations().catch(() => null),
        getProduct360Overview(id).catch(() => null),
    ]);

    const ledgerData = ledgerDataRes && ledgerDataRes.success && ledgerDataRes.data ? ledgerDataRes.data : null;
    const locations = locationsRes && locationsRes.success && locationsRes.data ? locationsRes.data : [];
    const overview = overviewRes && overviewRes.success && overviewRes.data ? overviewRes.data : null;

    if (!ledgerData) {
        notFound();
    }

    return (
        <Product360Tabs
            productVariantId={id}
            ledgerData={serializeData(ledgerData) as unknown as ComponentProps<typeof StockLedgerClient>['ledgerData']}
            locations={serializeData(locations) as unknown as ComponentProps<typeof StockLedgerClient>['locations']}
            overview={serializeData(overview) as unknown as {
                variant: { id: string; name: string; skuCode: string; primaryUnit: string; productType?: string; costingMethod?: string; standardCost?: { toNumber(): number } | number | null; minStockAlert?: { toNumber(): number } | number | null; reorderPoint?: { toNumber(): number } | number | null; reorderQuantity?: { toNumber(): number } | number | null; conversionFactor?: { toNumber(): number } | number; product?: { name: string } | null; preferredSupplier?: { name: string } | null };
                totalQty: number; totalValue: number;
            } | null}
            initialTab={tab || 'overview'}
        />
    );
}
