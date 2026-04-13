import { getReceivedPayments } from '@/actions/finance/finance';
import { ReceivedPaymentsClient } from '@/components/finance/payments/ReceivedPaymentsClient';
import { prisma } from '@/lib/core/prisma';
import { serializeData } from '@/lib/utils/utils';
import { InvoiceStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

import { parseISO, startOfMonth, endOfMonth } from 'date-fns';


export default async function ReceivedPaymentsPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const payments = await getReceivedPayments({ startDate: checkStart, endDate: checkEnd });

    if (!payments.success) {
        throw new Error(payments.error);
    }

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
        <div className="p-6">
            <ReceivedPaymentsClient
                payments={payments.data}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                unpaidInvoices={serializeData(unpaidInvoices) as any}
            />
        </div>
    );
}
