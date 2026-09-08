import { getAccountLedger } from '@/actions/finance/account-actions';
import { AccountLedgerClient } from '@/components/finance/coa/AccountLedgerClient';
import { serializeData } from '@/lib/utils/utils';
import { notFound } from 'next/navigation';
import { getWibDayBounds } from '@/lib/utils/timezone';
import { resolveAccountLedgerRange } from '@/lib/finance/account-ledger-range';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{
        startDate?: string | string[];
        endDate?: string | string[];
    }>;
}

export default async function AccountLedgerPage({
    params,
    searchParams,
}: PageProps) {
    const { id } = await params;
    const query = await searchParams;
    let dateRange;
    try {
        dateRange = resolveAccountLedgerRange(query);
    } catch {
        return (
            <p role="alert">
                Rentang tanggal tidak valid. Gunakan tanggal YYYY-MM-DD dengan
                tanggal awal tidak melewati tanggal akhir.
            </p>
        );
    }

    const ledgerData = await getAccountLedger(
        id,
        getWibDayBounds(dateRange.from).startOfDay,
        getWibDayBounds(dateRange.to).endOfDay,
    ).catch((error) => {
        console.error('Error fetching account ledger:', error);
        notFound();
    });

    if (!ledgerData || !ledgerData.success || !ledgerData.data) {
        notFound();
    }

    return (
        <AccountLedgerClient
            key={id}
            ledgerData={serializeData(ledgerData.data)}
            initialDateRange={dateRange}
        />
    );
}
