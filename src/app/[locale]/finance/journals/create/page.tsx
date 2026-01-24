import { getChartOfAccounts } from '@/actions/accounting';
import ManualJournalForm from '@/components/finance/accounting/manual-journal-form';

export default async function CreateManualJournalPage() {
    const accounts = await getChartOfAccounts();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Create Journal Entry</h1>
                <p className="text-muted-foreground">
                    Manually record a journal entry in the general ledger.
                </p>
            </div>

            <ManualJournalForm accounts={accounts} />
        </div>
    );
}
