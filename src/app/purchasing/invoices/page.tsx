import React from 'react';
import type { ComponentProps } from 'react';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { PurchaseInvoiceTable } from '@/components/purchasing/orders/PurchaseInvoiceTable';
import { PageHeader } from '@/components/ui/page-header';
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
import { canCreatePurchaseRemittance } from '@/lib/auth/purchasing-access';
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
    async (
        filters: Parameters<typeof PurchaseService.getPurchaseInvoicesPage>[0],
    ) => PurchaseService.getPurchaseInvoicesPage(filters),
);

function parseDateBounds(startDate?: string, endDate?: string) {
    const dateOnlyBounds = parsePurchasingDateBounds(startDate, endDate);
    return {
        startDate: dateOnlyBounds.startDate ?? parseIsoBoundary(startDate),
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
    let invoicesPage: Awaited<ReturnType<typeof getInvoices>>;
    try {
        invoicesPage = await getInvoices({
            page: parsePurchasingPageParam(params.page),
            pageSize: parsePurchasingPageParam(params.pageSize),
            search: params.search,
            status: initialStatus === 'OVERDUE' ? undefined : validStatus,
            overdue: overdueMode || initialStatus === 'OVERDUE',
            ...dateBounds,
            ...sorting,
        });
    } catch {
        return (
            <div className="space-y-4 p-4 md:p-6">
                <h1 className="text-2xl font-bold md:text-3xl">
                    Invoice Pembelian
                </h1>
                <p role="alert" className="text-destructive">
                    Gagal memuat invoice pembelian.
                </p>
                <p className="text-sm text-muted-foreground">
                    Data tidak dianggap kosong. Muat ulang halaman untuk mencoba
                    lagi.
                </p>
            </div>
        );
    }

    const serializedInvoices = serializeData(invoicesPage.items);

    const [outstandingRes, remittancesRes, paymentBanksRes, canCreate] =
        await Promise.all([
            listOutstandingPurchaseInvoicesAction().catch(() => null),
            listPurchaseRemittancesAction({}).catch(() => null),
            getPaymentBanks().catch(() => null),
            canCreatePurchaseRemittance(),
        ]);

    type ActionRes<T = unknown> = { success?: boolean; data?: T };
    const outstandingInvoices: unknown[] =
        (outstandingRes as ActionRes)?.success &&
        Array.isArray((outstandingRes as ActionRes).data)
            ? serializeData((outstandingRes as ActionRes).data as unknown[])
            : [];
    const remittances: unknown[] =
        (remittancesRes as ActionRes)?.success &&
        Array.isArray((remittancesRes as ActionRes).data)
            ? serializeData((remittancesRes as ActionRes).data as unknown[])
            : [];
    const paymentBanks: unknown[] =
        (paymentBanksRes as ActionRes)?.success &&
        Array.isArray((paymentBanksRes as ActionRes).data)
            ? ((paymentBanksRes as ActionRes).data as unknown[])
            : [];
    const auxiliaryState = {
        outstanding:
            !outstandingRes || !(outstandingRes as ActionRes).success
                ? ('error' as const)
                : outstandingInvoices.length > 0
                  ? ('ready' as const)
                  : ('empty' as const),
        remittances:
            !remittancesRes || !(remittancesRes as ActionRes).success
                ? ('error' as const)
                : remittances.length > 0
                  ? ('ready' as const)
                  : ('empty' as const),
        paymentBanks:
            !paymentBanksRes || !(paymentBanksRes as ActionRes).success
                ? ('error' as const)
                : paymentBanks.length > 0
                  ? ('ready' as const)
                  : ('missing' as const),
    };

    return (
        <div className="flex min-w-0 flex-col gap-6 p-4 md:p-6">
            <PageHeader
                title={`Invoice Pembelian${overdueMode ? ' — Jatuh Tempo' : ''}`}
                description={
                    overdueMode
                        ? 'Hanya invoice lewat jatuh tempo dan belum lunas.'
                        : 'Kelola tagihan supplier dan pengajuan pembayaran.'
                }
                actions={
                    <UrlTransactionDateFilter
                        defaultPreset="all"
                        presetTimeZone="Asia/Jakarta"
                        align="end"
                    />
                }
            />

            <PurchaseRemittanceEntryPoint
                invoices={outstandingInvoices as never}
                paymentBanks={paymentBanks as never}
                initialRemittances={remittances as never}
                canCreate={canCreate}
                auxiliaryState={auxiliaryState}
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
