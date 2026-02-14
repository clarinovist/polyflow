import { getReceivedPayments } from '@/actions/finance';
import { ReceivedPaymentsClient } from '@/components/finance/payments/ReceivedPaymentsClient';
import { prisma } from '@/lib/prisma';
import { serializeData } from '@/lib/utils';
import { InvoiceStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

import { parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { UrlTransactionDateFilter } from '@/components/ui/url-transaction-date-filter';

export default async function ReceivedPaymentsPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const payments = await getReceivedPayments({ startDate: checkStart, endDate: checkEnd });

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
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Customer Payments</h1>
                    <p className="text-muted-foreground">Track and manage payments received from customers.</p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="this_month" align="end" />
                </div>
            </div>

            <ReceivedPaymentsClient
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                payments={payments as any}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                unpaidInvoices={serializeData(unpaidInvoices) as any}
            />
        </div>
    );
}
