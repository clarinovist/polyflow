import { getChartOfAccounts } from '@/actions/finance/accounting';
import TransactionWizardForm from '@/components/finance/accounting/transaction-wizard-form';
import { PageHeader } from '@/components/ui/page-header';
import { getSalesInvoices, getPurchaseInvoices } from '@/actions/finance/invoices';
import { serializeData } from '@/lib/utils/utils';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Quick Entry | Polyflow Finance',
    description: 'Record transactions quickly without manual journal entries.',
};

export default async function QuickEntryPage() {
    const accountsRes = await getChartOfAccounts();
    const accounts = accountsRes.success && accountsRes.data ? accountsRes.data : [];

    // Fetch unpaid invoices for the wizard
    const [salesInvoicesRes, purchaseInvoicesRes] = await Promise.all([
        getSalesInvoices(),
        getPurchaseInvoices()
    ]);
    const salesInvoices = salesInvoicesRes.success && salesInvoicesRes.data ? salesInvoicesRes.data : [];
    const purchaseInvoices = purchaseInvoicesRes.success && purchaseInvoicesRes.data ? purchaseInvoicesRes.data : [];

    return (
        <div className="space-y-6 pb-20">
            <PageHeader
                title="Quick Entry"
                description="Catat transaksi keuangan dengan bahasa sehari-hari."
            />

            <TransactionWizardForm
                accounts={accounts}
                salesInvoices={serializeData(salesInvoices)}
                purchaseInvoices={serializeData(purchaseInvoices)}
            />
        </div>
    );
}
