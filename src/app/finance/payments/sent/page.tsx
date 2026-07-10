import { getSentPayments } from '@/actions/finance/finance';
import { SentPaymentsClient } from '@/components/finance/payments/SentPaymentsClient';
import { getOutstandingPurchaseInvoices } from '@/actions/finance/invoices';
import { getPaymentBanksSetting } from '@/services/settings/app-settings-service';
import { withTenantPage } from '@/lib/core/tenant';

export const dynamic = 'force-dynamic';

import { parseISO } from 'date-fns';

const loadPaymentBanks = withTenantPage(async () => getPaymentBanksSetting());

export default async function SentPaymentsPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string }> }) {
    const params = await searchParams;

    // Only filter payments by date when explicitly provided (invoice dropdown is always full outstanding list)
    const checkStart = params?.startDate ? parseISO(params.startDate) : undefined;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : undefined;

    const [payments, unpaidInvoicesRes] = await Promise.all([
        getSentPayments(
            checkStart && checkEnd ? { startDate: checkStart, endDate: checkEnd } : undefined
        ),
        getOutstandingPurchaseInvoices(),
    ]);

    if (!payments.success) {
        throw new Error(payments.error);
    }

    if (!unpaidInvoicesRes.success) {
        throw new Error(unpaidInvoicesRes.error ?? 'Gagal memuat daftar invoice belum lunas');
    }

    // Already filtered (outstanding > 0) and serialized by the action
    const unpaidInvoices = unpaidInvoicesRes.data ?? [];

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
                unpaidInvoices={unpaidInvoices}
                paymentBanks={paymentBanks}
            />
        </div>
    );
}
