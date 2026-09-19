import type { ComponentProps } from 'react';
import { Prisma } from '@prisma/client';
import { getReceivedPayments } from '@/actions/finance/finance';
import { ReceivedPaymentsClient } from '@/components/finance/payments/ReceivedPaymentsClient';
import { getSalesInvoices } from '@/actions/finance/invoices';
import { listRemittancesForVerificationAction } from '@/actions/sales/collection';
import { serializeData } from '@/lib/utils/utils';
import { getPaymentBanksSetting } from '@/services/settings/app-settings-service';
import type { TenantPaymentBanks } from '@/lib/finance/payment-methods';
import { withTenantPage } from '@/lib/core/tenant';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';

import { parseISO } from 'date-fns';

const loadPaymentBanks = withTenantPage(async () => getPaymentBanksSetting());

// Identity is selected server-side; the selector query excludes ineligible statuses.
type UnpaidSalesInvoice = {
    id: string;
    invoiceNumber: string;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    creditedAmount: Prisma.Decimal;
    priceAdjustmentAmount: Prisma.Decimal;
    salesOrder: {
        orderNumber: string;
        customerId?: string | null;
        customer: { name: string } | null;
    } | null;
};

type UnpaidInvoicesProp = ComponentProps<
    typeof ReceivedPaymentsClient
>['unpaidInvoices'];

export default async function ReceivedPaymentsPage({
    searchParams,
}: {
    searchParams: Promise<{
        startDate?: string;
        endDate?: string;
        demand?: 'customer' | 'legacy-internal';
        invoiceSearch?: string;
    }>;
}) {
    const params = await searchParams;
    const demand = params?.demand || 'customer';

    // Only filter by date when explicitly provided
    const checkStart = params?.startDate
        ? parseISO(params.startDate)
        : undefined;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : undefined;

    const buildDemandHref = (nextDemand: 'customer' | 'legacy-internal') => {
        const query = new URLSearchParams();
        query.set('demand', nextDemand);
        if (params?.startDate) query.set('startDate', params.startDate);
        if (params?.endDate) query.set('endDate', params.endDate);
        return `/finance/payments/received?${query.toString()}`;
    };

    const payments = await getReceivedPayments(
        checkStart && checkEnd
            ? { startDate: checkStart, endDate: checkEnd }
            : undefined,
        demand,
    );

    if (!payments.success) {
        throw new Error(payments.error);
    }

    // Fetch invoices with outstanding balance (Outstanding > 0)
    const unpaidInvoicesRes = await getSalesInvoices(undefined, {
        demandType: demand,
        paymentSelector: true,
        search: params.invoiceSearch,
    });
    const allInvoices =
        unpaidInvoicesRes.success && unpaidInvoicesRes.data
            ? unpaidInvoicesRes.data
            : [];
    const unpaidInvoices = (allInvoices as UnpaidSalesInvoice[]).filter(
        (inv) => {
            const hasOutstanding =
                Number(inv.totalAmount) + Number(inv.priceAdjustmentAmount ?? 0) - Number(inv.paidAmount) - Number(inv.creditedAmount ?? 0) > 0;
            if (!hasOutstanding) return false;
            if (demand === 'customer') {
                return inv.salesOrder?.customerId != null;
            }
            return inv.salesOrder?.customerId == null;
        },
    );

    let paymentBanks: TenantPaymentBanks = [];
    try {
        paymentBanks = await loadPaymentBanks();
    } catch {
        paymentBanks = [];
    }

    const pendingRemittancesRes = await listRemittancesForVerificationAction({
        status: 'PENDING',
    }).catch(() => null);
    const pendingRemittances =
        pendingRemittancesRes?.success && pendingRemittancesRes.data
            ? serializeData(pendingRemittancesRes.data)
            : [];

    return (
        <div className="p-6">
            <div className="mb-6">
                <Tabs defaultValue={demand} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 md:w-[420px]">
                        <TabsTrigger value="customer" asChild>
                            <Link href={buildDemandHref('customer')}>
                                Customer Receipts
                            </Link>
                        </TabsTrigger>
                        <TabsTrigger value="legacy-internal" asChild>
                            <Link href={buildDemandHref('legacy-internal')}>
                                Legacy Internal
                            </Link>
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
            {demand === 'legacy-internal' && (
                <div className="mb-6">
                    <Alert className="border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20">
                        <AlertTitle>Legacy internal receipts</AlertTitle>
                        <AlertDescription>
                            These records exist for historical reconciliation
                            only. New internal stock build should no longer
                            create customer receipts through finance, but
                            existing outstanding invoices here can still be
                            settled through Record Payment.
                        </AlertDescription>
                    </Alert>
                </div>
            )}
            <form className="mb-4 flex gap-2" method="get">
                <input type="hidden" name="demand" value={demand} />
                {params.startDate && (
                    <input
                        type="hidden"
                        name="startDate"
                        value={params.startDate}
                    />
                )}
                {params.endDate && (
                    <input
                        type="hidden"
                        name="endDate"
                        value={params.endDate}
                    />
                )}
                <input
                    className="rounded border p-2"
                    name="invoiceSearch"
                    aria-label="Cari invoice belum lunas"
                    placeholder="Invoice / customer belum lunas"
                    defaultValue={params.invoiceSearch}
                />
                <button className="rounded border p-2" type="submit">
                    Cari invoice
                </button>
            </form>
            {allInvoices.length >= 200 && (
                <p className="mb-4 text-sm text-amber-700">
                    Pilihan dibatasi 200 invoice. Gunakan pencarian untuk
                    invoice lainnya.
                </p>
            )}
            <ReceivedPaymentsClient
                payments={payments.data}
                unpaidInvoices={
                    serializeData(unpaidInvoices) as UnpaidInvoicesProp
                }
                demandType={demand}
                paymentBanks={paymentBanks}
                pendingRemittances={pendingRemittances as never}
            />
        </div>
    );
}
