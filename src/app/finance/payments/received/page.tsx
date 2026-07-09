import { getReceivedPayments } from '@/actions/finance/finance';
import { ReceivedPaymentsClient } from '@/components/finance/payments/ReceivedPaymentsClient';
import { getSalesInvoices } from '@/actions/finance/invoices';
import { serializeData } from '@/lib/utils/utils';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';

import { parseISO } from 'date-fns';

export default async function ReceivedPaymentsPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string, demand?: 'customer' | 'legacy-internal' }> }) {
    const params = await searchParams;
    const demand = params?.demand || 'customer';

    // Only filter by date when explicitly provided
    const checkStart = params?.startDate ? parseISO(params.startDate) : undefined;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : undefined;

    const buildDemandHref = (nextDemand: 'customer' | 'legacy-internal') => {
        const query = new URLSearchParams();
        query.set('demand', nextDemand);
        if (params?.startDate) query.set('startDate', params.startDate);
        if (params?.endDate) query.set('endDate', params.endDate);
        return `/finance/payments/received?${query.toString()}`;
    };

    const payments = await getReceivedPayments(
        checkStart && checkEnd ? { startDate: checkStart, endDate: checkEnd } : undefined, demand
    );

    if (!payments.success) {
        throw new Error(payments.error);
    }

    // Fetch invoices with outstanding balance (Outstanding > 0)
    const unpaidInvoicesRes = await getSalesInvoices();
    const allInvoices = unpaidInvoicesRes.success && unpaidInvoicesRes.data ? unpaidInvoicesRes.data : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unpaidInvoices = (allInvoices as any[]).filter((inv: any) => {
        const hasOutstanding = Number(inv.totalAmount) - Number(inv.paidAmount) > 0;
        if (!hasOutstanding) return false;
        if (demand === 'customer') {
            return inv.salesOrder?.customerId != null;
        }
        return inv.salesOrder?.customerId == null;
    });

    return (
        <div className="p-6">
            <div className="mb-6">
                <Tabs defaultValue={demand} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 md:w-[420px]">
                        <TabsTrigger value="customer" asChild>
                            <Link href={buildDemandHref('customer')}>Customer Receipts</Link>
                        </TabsTrigger>
                        <TabsTrigger value="legacy-internal" asChild>
                            <Link href={buildDemandHref('legacy-internal')}>Legacy Internal</Link>
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
            {demand === 'legacy-internal' && (
                <div className="mb-6">
                    <Alert className="border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20">
                        <AlertTitle>Legacy internal receipts</AlertTitle>
                        <AlertDescription>
                            These records exist for historical reconciliation only. New internal stock build should no longer create customer receipts through finance, but existing outstanding invoices here can still be settled through Record Payment.
                        </AlertDescription>
                    </Alert>
                </div>
            )}
            <ReceivedPaymentsClient
                payments={payments.data}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                unpaidInvoices={serializeData(unpaidInvoices) as any}
                demandType={demand}
            />
        </div>
    );
}
