import { getChartOfAccounts } from '@/actions/finance/accounting';
import ImportJournalForm from '@/components/finance/accounting/import-journal-form';

export default async function ImportJournalPage() {
    const accountsRes = await getChartOfAccounts();
    const accounts = accountsRes.success && accountsRes.data ? accountsRes.data : [];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Import Journal Entries</h1>
                <p className="text-muted-foreground">
                    Bulk import journal entries from CSV files.
                </p>
            </div>

            <ImportJournalForm accounts={accounts} />
        </div>
    );
}
