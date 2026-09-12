import React from 'react';
import type { ComponentProps } from 'react';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { PurchaseInvoiceTable } from '@/components/purchasing/orders/PurchaseInvoiceTable';
import { PurchaseRemittanceEntryPoint } from '@/components/purchasing/PurchaseRemittanceEntryPoint';
import { Metadata } from 'next';

import { serializeData } from '@/lib/utils/utils';
import { withTenant } from '@/lib/core/tenant';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import {
    listOutstandingPurchaseInvoicesAction,
    listPurchaseRemittancesAction,
} from '@/actions/purchasing/purchase-remittance';
import { getPaymentBanks } from '@/actions/finance/payment-banks-actions';
import { PurchaseInvoiceStatus } from '@prisma/client';
import { PURCHASE_INVOICE_SORTS } from '@/services/purchasing/invoices-service';
import {
    parsePurchasingDateBounds,
    parsePurchasingPageParam,
    parsePurchasingSort,
} from '@/lib/purchasing/paged-list';

export const metadata: Metadata = {
    title: 'Invoice Pembelian | PolyFlow',
};

const getInvoices = withTenant(
    async (filters: Parameters<typeof PurchaseService.getPurchaseInvoicesPage>[0]) =>
        PurchaseService.getPurchaseInvoicesPage(filters),
);

function parseDateBounds(startDate?: string, endDate?: string) {
    const dateOnlyBounds = parsePurchasingDateBounds(startDate, endDate);
    return {
        startDate:
            dateOnlyBounds.startDate ?? parseIsoBoundary(startDate),
        endDate: dateOnlyBounds.endDate ?? parseIsoBoundary(endDate),
    };
}

function parseIsoBoundary(value?: string) {
    if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export default async function PurchasingInvoicesPage({
    searchParams,
}: {
    searchParams: Promise<{
        startDate?: string;
        endDate?: string;
        status?: string;
        overdue?: string;
        search?: string;
        page?: string;
        pageSize?: string;
        sort?: string;
        direction?: string;
    }>;
}) {
    const params = await searchParams;
    const initialStatus = params?.status;
    const overdueMode = params?.overdue === 'true';
    const validStatus = Object.values(PurchaseInvoiceStatus).includes(
        initialStatus as PurchaseInvoiceStatus,
    )
        ? (initialStatus as PurchaseInvoiceStatus)
        : undefined;
    const dateBounds = parseDateBounds(params.startDate, params.endDate);
    const sorting = parsePurchasingSort(
        params.sort,
        params.direction,
        PURCHASE_INVOICE_SORTS,
        'invoiceDate',
    );
    const invoicesPage = await getInvoices({
        page: parsePurchasingPageParam(params.page),
        pageSize: parsePurchasingPageParam(params.pageSize),
        search: params.search,
        status: initialStatus === 'OVERDUE' ? undefined : validStatus,
        overdue: overdueMode || initialStatus === 'OVERDUE',
        ...dateBounds,
        ...sorting,
    });

    const serializedInvoices = serializeData(invoicesPage.items);

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
            : [];

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
                    <UrlTransactionDateFilter
                        defaultPreset="all"
                        presetTimeZone="Asia/Jakarta"
                        align="end"
                    />
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
                pagination={{
                    page: invoicesPage.page,
                    pageSize: invoicesPage.pageSize,
                    totalCount: invoicesPage.totalCount,
                    totalPages: invoicesPage.totalPages,
                }}
                basePath="/purchasing/invoices"
                initialSearch={params.search}
                initialStatus={initialStatus}
                overdueMode={overdueMode}
                sort={sorting.sort}
                direction={sorting.direction}
            />
        </div>
    );
}
