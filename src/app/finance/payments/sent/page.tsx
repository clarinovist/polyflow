import { getSentPayments } from '@/actions/finance/finance';
import { SentPaymentsClient } from '@/components/finance/payments/SentPaymentsClient';
import { prisma } from '@/lib/core/prisma';
import { serializeData } from '@/lib/utils/utils';
import { PurchaseInvoiceStatus } from '@prisma/client';
import { withTenantPage } from '@/lib/core/tenant';

export const dynamic = 'force-dynamic';

import { parseISO, startOfMonth, endOfMonth } from 'date-fns';

const getUnpaidInvoices = withTenantPage(async () => {
    return prisma.purchaseInvoice.findMany({
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
});

export default async function SentPaymentsPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    // Only filter by date when explicitly provided
    const checkStart = params?.startDate ? parseISO(params.startDate) : undefined;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : undefined;

    const payments = await getSentPayments(
        checkStart && checkEnd ? { startDate: checkStart, endDate: checkEnd } : undefined
    );

    if (!payments.success) {
        throw new Error(payments.error);
    }

    // Fetch unpaid purchase invoices for payment recording
    const unpaidInvoices = await getUnpaidInvoices();

    return (
        <div className="p-6">
            <SentPaymentsClient
                payments={payments.data}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                unpaidInvoices={serializeData(unpaidInvoices) as any}
            />
        </div>
    );
}
