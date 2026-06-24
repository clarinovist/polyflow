import { getReceivedPayments } from '@/actions/finance/finance';
import { ReceivedPaymentsClient } from '@/components/finance/payments/ReceivedPaymentsClient';
import { prisma } from '@/lib/core/prisma';
import { serializeData } from '@/lib/utils/utils';
import { InvoiceStatus } from '@prisma/client';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { withTenantPage } from '@/lib/core/tenant';

export const dynamic = 'force-dynamic';

import { parseISO } from 'date-fns';

const getUnpaidInvoices = withTenantPage(async (demand: string) => {
    return prisma.invoice.findMany({
        where: {
            status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE] },
            salesOrder: demand === 'customer'
                ? { customerId: { not: null } }
                : { customerId: null }
        },
        include: {
            salesOrder: {
                include: { customer: true }
            }
        },
        orderBy: { invoiceDate: 'desc' }
    });
});

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

    // Fetch unpaid invoices for payment recording
    const unpaidInvoices = await getUnpaidInvoices(demand);

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
