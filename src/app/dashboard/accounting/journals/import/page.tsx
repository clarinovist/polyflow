import { getChartOfAccounts } from '@/actions/accounting';
import ImportJournalForm from '@/components/accounting/import-journal-form';

export default async function ImportJournalPage() {
    const accounts = await getChartOfAccounts();

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
