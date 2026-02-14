import { getSentPayments } from '@/actions/finance';
import { SentPaymentsClient } from '@/components/finance/payments/SentPaymentsClient';
import { prisma } from '@/lib/prisma';
import { serializeData } from '@/lib/utils';
import { PurchaseInvoiceStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

import { parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { UrlTransactionDateFilter } from '@/components/ui/url-transaction-date-filter';

export default async function SentPaymentsPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const payments = await getSentPayments({ startDate: checkStart, endDate: checkEnd });

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
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Supplier Payments</h1>
                    <p className="text-muted-foreground">Track and manage payments sent to suppliers.</p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="this_month" align="end" />
                </div>
            </div>

            <SentPaymentsClient
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                payments={payments as any}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                unpaidInvoices={serializeData(unpaidInvoices) as any}
            />
        </div>
    );
}
