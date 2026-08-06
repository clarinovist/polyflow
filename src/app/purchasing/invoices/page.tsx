import React from 'react';
import type { ComponentProps } from 'react';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { PurchaseInvoiceTable } from '@/components/purchasing/orders/PurchaseInvoiceTable';
import { PurchaseRemittanceEntryPoint } from '@/components/purchasing/PurchaseRemittanceEntryPoint';
import { Metadata } from 'next';

import { serializeData } from '@/lib/utils/utils';
import { withTenant } from '@/lib/core/tenant';
import { parseISO } from 'date-fns';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import {
    listOutstandingPurchaseInvoicesAction,
    listPurchaseRemittancesAction,
} from '@/actions/purchasing/purchase-remittance';
import { getPaymentBanks } from '@/actions/finance/payment-banks-actions';

export const metadata: Metadata = {
    title: 'Invoice Pembelian | PolyFlow',
};

const getInvoices = withTenant(
    async (dateRange?: { startDate?: Date; endDate?: Date }) => {
        return PurchaseService.getPurchaseInvoices(dateRange);
    },
);

export default async function PurchasingInvoicesPage({
    searchParams,
}: {
    searchParams: Promise<{
        startDate?: string;
        endDate?: string;
        status?: string;
        overdue?: string;
    }>;
}) {
    const params = await searchParams;
    const initialStatus = params?.status;
    const overdueMode = params?.overdue === 'true';

    const dateRange =
        params?.startDate && params?.endDate
            ? {
                  startDate: parseISO(params.startDate),
                  endDate: parseISO(params.endDate),
              }
            : undefined;

    const invoices = await getInvoices(dateRange);

    const serializedInvoices = serializeData(invoices);

    const [outstandingRes, remittancesRes, paymentBanksRes] = await Promise.all(
        [
            listOutstandingPurchaseInvoicesAction().catch(() => null),
            listPurchaseRemittancesAction({}).catch(() => null),
            getPaymentBanks().catch(() => null),
        ],
    );

    type ActionRes<T = unknown> = { success?: boolean; data?: T };
    const outstandingInvoices =
        (outstandingRes as ActionRes)?.success &&
        (outstandingRes as ActionRes).data
            ? serializeData((outstandingRes as ActionRes).data)
            : [];
    const remittances =
        (remittancesRes as ActionRes)?.success &&
        (remittancesRes as ActionRes).data
            ? serializeData((remittancesRes as ActionRes).data)
            : [];
    const paymentBanks =
        (paymentBanksRes as ActionRes)?.success &&
        (paymentBanksRes as ActionRes).data
            ? (paymentBanksRes as ActionRes).data
            : {};

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">
                        Invoice Pembelian{overdueMode ? ' — Jatuh Tempo' : ''}
                    </h1>
                    <p className="text-muted-foreground">
                        {overdueMode
                            ? 'Filter: hanya invoice lewat jatuh tempo (today > dueDate & belum lunas).'
                            : 'Kelola invoice pembelian supplier.'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="all" align="end" />
                </div>
            </div>

            <PurchaseRemittanceEntryPoint
                invoices={outstandingInvoices as never}
                paymentBanks={paymentBanks as never}
                initialRemittances={remittances as never}
            />

            <PurchaseInvoiceTable
                invoices={
                    serializedInvoices as ComponentProps<
                        typeof PurchaseInvoiceTable
                    >['invoices']
                }
                basePath="/purchasing/invoices"
                initialStatus={initialStatus}
                overdueMode={overdueMode}
            />
        </div>
    );
}
