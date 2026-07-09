import { getSentPayments } from '@/actions/finance/finance';
import { SentPaymentsClient } from '@/components/finance/payments/SentPaymentsClient';
import { getPurchaseInvoices } from '@/actions/finance/invoices';
import { serializeData } from '@/lib/utils/utils';
import { getPaymentBanksSetting } from '@/services/settings/app-settings-service';
import { withTenantPage } from '@/lib/core/tenant';

export const dynamic = 'force-dynamic';

import { parseISO } from 'date-fns';

const loadPaymentBanks = withTenantPage(async () => getPaymentBanksSetting());

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

    // Fetch purchase invoices with outstanding balance (Outstanding > 0)
    const unpaidInvoicesRes = await getPurchaseInvoices();
    const allInvoices = unpaidInvoicesRes.success && unpaidInvoicesRes.data ? unpaidInvoicesRes.data : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unpaidInvoices = (allInvoices as any[]).filter((inv: any) =>
        Number(inv.totalAmount) - Number(inv.paidAmount) > 0
    );

    let paymentBanks = {};
    try {
        paymentBanks = await loadPaymentBanks();
    } catch {
        paymentBanks = {};
    }

    return (
        <div className="p-6">
            <SentPaymentsClient
                payments={payments.data}
                unpaidInvoices={serializeData(unpaidInvoices)}
                paymentBanks={paymentBanks}
            />
        </div>
    );
}
