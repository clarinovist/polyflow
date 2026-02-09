import { getChartOfAccounts } from '@/actions/accounting';
import TransactionWizardForm from '@/components/finance/accounting/transaction-wizard-form';
import { PageHeader } from '@/components/ui/page-header';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Quick Entry | Polyflow Finance',
    description: 'Record transactions quickly without manual journal entries.',
};

export default async function QuickEntryPage() {
    const accounts = await getChartOfAccounts();

    return (
        <div className="space-y-6 pb-20">
            <PageHeader
                title="Quick Entry"
                description="Catat transaksi keuangan dengan bahasa sehari-hari."
            />

            <TransactionWizardForm accounts={accounts} />
        </div>
    );
}
