import { getSentPayments } from '@/actions/finance/finance';
import { SentPaymentsClient } from '@/components/finance/payments/SentPaymentsClient';
import { getPurchaseInvoices } from '@/actions/finance/invoices';
import { serializeData } from '@/lib/utils/utils';
import { PurchaseInvoiceStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

import { parseISO } from 'date-fns';

export default async function SentPaymentsPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;

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
    const unpaidInvoicesRes = await getPurchaseInvoices();
    const allInvoices = unpaidInvoicesRes.success && unpaidInvoicesRes.data ? unpaidInvoicesRes.data : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unpaidInvoices = (allInvoices as any[]).filter((inv: any) =>
        [PurchaseInvoiceStatus.UNPAID, PurchaseInvoiceStatus.PARTIAL, PurchaseInvoiceStatus.OVERDUE].includes(inv.status)
    );

    return (
        <div className="p-6">
            <SentPaymentsClient
                payments={payments.data}
                unpaidInvoices={serializeData(unpaidInvoices)}
            />
        </div>
    );
}
