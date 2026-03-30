import { getSentPayments } from '@/actions/finance/finance';
import { SentPaymentsClient } from '@/components/finance/payments/SentPaymentsClient';
import { prisma } from '@/lib/core/prisma';
import { serializeData } from '@/lib/utils/utils';
import { PurchaseInvoiceStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

import { parseISO, startOfMonth, endOfMonth } from 'date-fns';


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
        <div className="p-6">
            <SentPaymentsClient
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                payments={payments as any}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                unpaidInvoices={serializeData(unpaidInvoices) as any}
            />
        </div>
    );
}
