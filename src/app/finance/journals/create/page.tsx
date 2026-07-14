import { getChartOfAccounts } from '@/actions/finance/accounting';
import ManualJournalForm from '@/components/finance/accounting/manual-journal-form';
import DetailJournalForm from '@/components/finance/accounting/detail-journal-form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default async function CreateManualJournalPage() {
    const accountsRes = await getChartOfAccounts();
    const accounts = accountsRes.success && accountsRes.data ? accountsRes.data : [];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Create Journal Entry</h1>
                <p className="text-muted-foreground">
                    Manually record a journal entry in the general ledger.
                </p>
            </div>

            <Tabs defaultValue="manual" className="w-full">
                <TabsList>
                    <TabsTrigger value="manual">Manual Journal</TabsTrigger>
                    <TabsTrigger value="detail-input">Detail Input</TabsTrigger>
                </TabsList>
                <TabsContent value="manual" className="mt-4">
                    <ManualJournalForm accounts={accounts} />
                </TabsContent>
                <TabsContent value="detail-input" className="mt-4">
                    <DetailJournalForm accounts={accounts} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
