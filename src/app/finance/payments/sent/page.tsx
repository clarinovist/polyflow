import { getSentPayments } from '@/actions/finance';
import { SentPaymentsClient } from '@/components/finance/payments/SentPaymentsClient';
import { prisma } from '@/lib/prisma';
import { serializeData } from '@/lib/utils';
import { PurchaseInvoiceStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function SentPaymentsPage() {
    const payments = await getSentPayments();

    // Fetch unpaid purchase invoices for payment recording
    const unpaidInvoices = await prisma.purchaseInvoice.findMany({
        where: {
            status: { in: [PurchaseInvoiceStatus.UNPAID, PurchaseInvoiceStatus.PARTIAL, PurchaseInvoiceStatus.OVERDUE] }
        },
        include: {
            purchaseOrder: {
                include: { supplier: true }
            }
        },
        orderBy: { invoiceDate: 'desc' }
    });

    return (
        <SentPaymentsClient
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            payments={payments as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            unpaidInvoices={serializeData(unpaidInvoices) as any}
        />
    );
}
