import type { ComponentProps } from 'react';
import { getFinanceSalesInvoicePage } from '@/actions/finance/invoice';
import { InvoiceStatus } from '@prisma/client';
import { InvoiceTable } from '@/components/sales/InvoiceTable';

import { serializeData } from '@/lib/utils/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ContextualHelp } from '@/components/support/contextual-help';

import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { getWibDayBounds } from '@/lib/utils/timezone';

export default async function InvoicesPage({
    searchParams,
}: {
    searchParams: Promise<{
        startDate?: string;
        endDate?: string;
        demand?: 'customer' | 'legacy-internal';
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
    const demand = params?.demand || 'customer';
    const initialStatus = params?.status;

    let dateRange: { startDate: Date; endDate: Date } | undefined;
    if (params.startDate && params.endDate) {
        try {
            const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
            const startDate = dateOnlyPattern.test(params.startDate)
                ? getWibDayBounds(params.startDate).startOfDay
                : new Date(params.startDate);
            const endDate = dateOnlyPattern.test(params.endDate)
                ? getWibDayBounds(params.endDate).endOfDay
                : new Date(params.endDate);
            if (
                !Number.isNaN(startDate.getTime()) &&
                !Number.isNaN(endDate.getTime()) &&
                startDate <= endDate
            ) {
                dateRange = { startDate, endDate };
            }
        } catch {
            // Ignore malformed/incomplete URL date pairs before they reach Prisma.
        }
    }

    const status = Object.values(InvoiceStatus).includes(
        params.status as InvoiceStatus,
    )
        ? (params.status as InvoiceStatus)
        : undefined;
    const sortKeys = [
        'invoiceDate',
        'entity',
        'status',
        'totalAmount',
    ] as const;
    type InvoiceSortKey = (typeof sortKeys)[number];
    const sort = sortKeys.includes(params.sort as InvoiceSortKey)
        ? (params.sort as InvoiceSortKey)
        : 'invoiceDate';
    const direction =
        params.direction === 'asc' || params.direction === 'desc'
            ? params.direction
            : 'desc';

    const buildDemandHref = (nextDemand: 'customer' | 'legacy-internal') => {
        const query = new URLSearchParams();
        query.set('demand', nextDemand);
        if (params?.startDate) query.set('startDate', params.startDate);
        if (params?.endDate) query.set('endDate', params.endDate);
        if (params?.status) query.set('status', params.status);
        if (params?.overdue) query.set('overdue', params.overdue);
        if (params?.search) query.set('search', params.search);
        if (params?.pageSize) query.set('pageSize', params.pageSize);
        query.set('sort', sort);
        query.set('direction', direction);
        return `/finance/invoices/sales?${query.toString()}`;
    };

    const invoices = await getFinanceSalesInvoicePage({
        page: Number(params.page),
        pageSize: Number(params.pageSize),
        search: params.search,
        startDate: dateRange?.startDate,
        endDate: dateRange?.endDate,
        demandType: demand,
        status,
        overdue: params.overdue === 'true',
        sort,
        direction,
    });

    if (!invoices.success) {
        throw new Error(
            invoices.error || 'Gagal memuat invoice sales. Silakan coba lagi.',
        );
    }
    if (!invoices.data) {
        throw new Error('Gagal memuat invoice sales. Silakan coba lagi.');
    }

    const invoicePage = serializeData(invoices.data);

    return (
        <div className="min-w-0 max-w-full space-y-6">
            <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="flex flex-col gap-2">
                    <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                        Invoice Sales
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Kelola tagihan customer dan lacak pembayaran tertunggak.
                    </p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <ContextualHelp
                        title="Panduan Invoice"
                        prefillQuestion="Kenapa error period locked saat posting invoice?"
                        links={[
                            {
                                title: 'Cara Lihat Invoice Belum Lunas',
                                slug: 'cara-lihat-invoice-belum-lunas',
                            },
                            {
                                title: 'Error Period Locked',
                                slug: 'error-period-locked-finance',
                            },
                        ]}
                    />
                    <UrlTransactionDateFilter
                        defaultPreset="all"
                        presetTimeZone="Asia/Jakarta"
                        align="end"
                    />
                </div>
            </div>

            <Tabs defaultValue={demand} className="min-w-0 max-w-full">
                <TabsList className="grid w-full grid-cols-2 md:w-[420px]">
                    <TabsTrigger value="customer" asChild>
                        <Link href={buildDemandHref('customer')}>
                            Customer AR
                        </Link>
                    </TabsTrigger>
                    <TabsTrigger value="legacy-internal" asChild>
                        <Link href={buildDemandHref('legacy-internal')}>
                            Legacy Internal
                        </Link>
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            {demand === 'legacy-internal' && (
                <Alert className="border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20">
                    <AlertTitle>Legacy internal review</AlertTitle>
                    <AlertDescription>
                        This tab is for historical invoices that originated from
                        internal stock build flows before customer enforcement
                        was added. Treat it as cleanup and audit review, not as
                        a normal receivables workflow.
                    </AlertDescription>
                </Alert>
            )}

            <InvoiceTable
                invoices={
                    invoicePage.data as ComponentProps<
                        typeof InvoiceTable
                    >['invoices']
                }
                basePath="/finance/invoices/sales"
                initialStatus={initialStatus}
                pagination={invoicePage.meta}
                serverSorting={{ sort, direction }}
            />
        </div>
    );
}
