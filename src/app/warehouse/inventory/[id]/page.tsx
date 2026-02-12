import { getStockLedgerAction, getLocations } from '@/actions/inventory';
import { StockLedgerClient } from '@/components/warehouse/StockLedgerClient';
import { serializeData } from '@/lib/utils';
import { notFound } from 'next/navigation';
import { startOfMonth, endOfMonth } from 'date-fns';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ startDate?: string; endDate?: string; locationId?: string }>;
}

export default async function StockLedgerPage({ params, searchParams }: PageProps) {
    const { id } = await params;
    const { startDate, endDate, locationId } = await searchParams;

    // Default to current month if no dates provided
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const [ledgerData, locations] = await Promise.all([
        getStockLedgerAction(
            id,
            startDate ? new Date(startDate) : defaultStart,
            endDate ? new Date(endDate) : defaultEnd,
            locationId === 'all' ? undefined : locationId
        ).catch((error) => {
            console.error('Error fetching stock ledger:', error);
            return null;
        }),
        getLocations().catch(() => [])
    ]);

    if (!ledgerData) {
        notFound();
    }

    return (
        <StockLedgerClient
            ledgerData={serializeData(ledgerData)}
            locations={serializeData(locations)}
        />
    );
}
