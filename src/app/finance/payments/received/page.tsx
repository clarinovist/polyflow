import { getReceivedPayments } from '@/actions/finance';
import { ReceivedPaymentsClient } from '@/components/finance/payments/ReceivedPaymentsClient';
import { prisma } from '@/lib/prisma';
import { serializeData } from '@/lib/utils';
import { InvoiceStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function ReceivedPaymentsPage() {
    const payments = await getReceivedPayments();

    // Fetch unpaid invoices for payment recording
    const unpaidInvoices = await prisma.invoice.findMany({
        where: {
            status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE] }
        },
        include: {
            salesOrder: {
                include: { customer: true }
            }
        },
        orderBy: { invoiceDate: 'desc' }
    });

    return (
        <ReceivedPaymentsClient
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            payments={payments as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            unpaidInvoices={serializeData(unpaidInvoices) as any}
        />
    );
}
