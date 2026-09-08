import { GeneralLedgerClient } from '@/components/finance/reports/GeneralLedgerClient';
import { parseGeneralLedgerQuery } from '@/components/finance/reports/general-ledger-query';

interface GeneralLedgerPageProps {
    searchParams: Promise<{
        account?: string | string[];
        to?: string | string[];
    }>;
}

export default async function GeneralLedgerPage({
    searchParams,
}: GeneralLedgerPageProps) {
    const query = parseGeneralLedgerQuery(await searchParams);
    return (
        <GeneralLedgerClient
            key={`${query.accountId ?? ''}:${query.toDate ?? ''}`}
            initialAccountId={query.accountId}
            initialToDate={query.toDate}
        />
    );
}
