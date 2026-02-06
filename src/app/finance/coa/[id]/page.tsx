import { getAccountLedger } from '@/actions/finance/account-actions';
import { AccountLedgerClient } from '@/components/finance/coa/AccountLedgerClient';
import { serializeData } from '@/lib/utils';
import { notFound } from 'next/navigation';
import { startOfMonth, endOfMonth } from 'date-fns';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ startDate?: string; endDate?: string }>;
}

export default async function AccountLedgerPage({ params, searchParams }: PageProps) {
    const { id } = await params;
    const { startDate, endDate } = await searchParams;

    // Default to current month if no dates provided
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const ledgerData = await getAccountLedger(
        id,
        startDate ? new Date(startDate) : defaultStart,
        endDate ? new Date(endDate) : defaultEnd
    ).catch((error) => {
        console.error('Error fetching account ledger:', error);
        notFound();
    });

    if (!ledgerData) {
        notFound();
    }

    return (
        <AccountLedgerClient
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ledgerData={serializeData(ledgerData) as any}
        />
    );
}
