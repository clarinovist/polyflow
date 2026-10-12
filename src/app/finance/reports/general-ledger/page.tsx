import { GeneralLedgerClient } from '@/components/finance/reports/GeneralLedgerClient';
import { parseGeneralLedgerQuery } from '@/components/finance/reports/general-ledger-query';

interface GeneralLedgerPageProps {
    searchParams: Promise<{
        account?: string | string[];
        from?: string | string[];
        to?: string | string[];
        q?: string | string[];
        mode?: string | string[];
    }>;
}

export default async function GeneralLedgerPage({
    searchParams,
}: GeneralLedgerPageProps) {
    const query = parseGeneralLedgerQuery(await searchParams);
    return (
        <GeneralLedgerClient
            key={`${query.accountId ?? ''}:${query.startDate ?? ''}:${query.toDate ?? ''}:${query.search ?? ''}:${query.mode ?? ''}`}
            initialAccountId={query.accountId}
            initialFromDate={query.startDate}
            initialToDate={query.toDate}
            initialSearch={query.search}
            initialSearchMode={query.mode}
        />
    );
}
