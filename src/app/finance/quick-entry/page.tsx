import { getChartOfAccounts } from '@/actions/accounting';
import TransactionWizardForm from '@/components/finance/accounting/transaction-wizard-form';
import { PageHeader } from '@/components/ui/page-header';
import { prisma } from '@/lib/prisma';
import { serializeData } from '@/lib/utils';
import { InvoiceStatus, PurchaseInvoiceStatus } from '@prisma/client';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Quick Entry | Polyflow Finance',
    description: 'Record transactions quickly without manual journal entries.',
};

export default async function QuickEntryPage() {
    const accounts = await getChartOfAccounts();

    // Fetch unpaid invoices for the wizard
    const [salesInvoices, purchaseInvoices] = await Promise.all([
        prisma.invoice.findMany({
            where: {
                status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE] }
            },
            include: {
                salesOrder: {
                    include: { customer: true }
                }
            },
            orderBy: { invoiceDate: 'desc' }
        }),
        prisma.purchaseInvoice.findMany({
            where: {
                status: { in: [PurchaseInvoiceStatus.UNPAID, PurchaseInvoiceStatus.PARTIAL, PurchaseInvoiceStatus.OVERDUE] }
            },
            include: {
                purchaseOrder: {
                    include: { supplier: true }
                }
            },
            orderBy: { invoiceDate: 'desc' }
        })
    ]);

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
