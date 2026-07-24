import { getSalesOrders, getSalesOrderStats } from '@/actions/sales/sales';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, ShoppingCart, Clock, CheckCircle, XCircle, Archive, ArrowLeft, Banknote, Package as PackageIcon } from 'lucide-react';
import Link from 'next/link';
import { SalesOrderTable } from '@/components/sales/SalesOrderTable';
import { SalesOrderFilters } from '@/components/sales/SalesOrderFilters';
import { serializeData, formatRupiah } from '@/lib/utils/utils';
import { SalesOrderType, SalesOrderStatus } from '@prisma/client';
import { salesLabels } from '@/lib/labels';
import { OrderPeriodHint } from '@/components/sales/OrderPeriodHint';
import { ContextualHelp } from '@/components/support/contextual-help';

import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';

/** Map fulfill query param to SalesOrderType[] */
function fulfillToOrderTypes(fulfill: string): SalesOrderType[] | undefined {
    switch (fulfill) {
        case 'stock': return [SalesOrderType.MAKE_TO_STOCK];
        case 'produce': return [SalesOrderType.MAKE_TO_ORDER];
        case 'maklon': return [SalesOrderType.MAKLON_JASA];
        default: return undefined;
    }
}

/** Map status query param to SalesOrderStatus[] */
function parseStatusFilter(status: string): SalesOrderStatus[] | undefined {
    if (!status) return undefined;
    const parts = status.split(',').map(s => s.trim());
    const valid: SalesOrderStatus[] = [];
    for (const s of parts) {
        if (Object.values(SalesOrderStatus).includes(s as SalesOrderStatus)) {
            valid.push(s as SalesOrderStatus);
        }
    }
    return valid.length > 0 ? valid : undefined;
}

/**
 * Legacy quick-view URLs → filter query params (no chips UI).
 * Keeps old bookmarks/sidebar links working without a separate "mode".
 */
function legacyViewToFilters(view: string | undefined): {
    status?: string;
    fulfill?: string;
    payment?: string;
} | null {
    switch (view) {
        case 'mts-unpaid':
            return { fulfill: 'stock', payment: 'outstanding' };
        case 'unpaid':
            return { payment: 'outstanding' };
        case 'ready':
            return { status: SalesOrderStatus.READY_TO_SHIP };
        default:
            return null;
    }
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string, demand?: string, view?: string, status?: string, fulfill?: string, payment?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    const demandParam = params?.demand;
    const isArchive = demandParam === 'legacy-internal' || params?.view === 'archive';

    // Redirect legacy chip URLs to plain filter params (one-time clean URL)
    if (!isArchive && params?.view) {
        const mapped = legacyViewToFilters(params.view);
        if (mapped) {
            const q = new URLSearchParams();
            const status = params.status || mapped.status;
            const fulfill = params.fulfill || mapped.fulfill;
            const payment = params.payment || mapped.payment;
            if (status) q.set('status', status);
            if (fulfill) q.set('fulfill', fulfill);
            if (payment) q.set('payment', payment);
            if (params.startDate) q.set('startDate', params.startDate);
            if (params.endDate) q.set('endDate', params.endDate);
            redirect(`/sales/orders${q.toString() ? `?${q.toString()}` : ''}`);
        }
    }

    const currentFilters = {
        status: params?.status || '',
        fulfill: params?.fulfill || '',
        payment: params?.payment || '',
    };

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const fulfillTypes = fulfillToOrderTypes(currentFilters.fulfill);
    const statusList = parseStatusFilter(currentFilters.status);

    const extraFilters: Parameters<typeof getSalesOrders>[3] = {};
    if (fulfillTypes) extraFilters.orderTypes = fulfillTypes;
    if (statusList) extraFilters.statusFilter = statusList;
    if (currentFilters.payment) {
        extraFilters.paymentState = currentFilters.payment as 'outstanding' | 'paid' | 'no_invoice';
    }

    // Archive: default all-time unless user sets dates
    const archiveCheckStart = params?.startDate ? parseISO(params.startDate) : undefined;
    const archiveCheckEnd = params?.endDate ? parseISO(params.endDate) : undefined;
    const archiveDateRange = archiveCheckStart && archiveCheckEnd
        ? { startDate: archiveCheckStart, endDate: archiveCheckEnd }
        : undefined;

    const dateRange = { startDate: checkStart, endDate: checkEnd };

    const ordersRes = isArchive
        ? await getSalesOrders(true, archiveDateRange, 'legacy-internal')
        : await getSalesOrders(true, dateRange, 'customer', extraFilters);

    // P0 fix: stats ikut dateRange list — stats global misleading
    const statsRes = isArchive
        ? await getSalesOrderStats(archiveDateRange)
        : await getSalesOrderStats(dateRange);

    const orders = ordersRes.success && ordersRes.data ? ordersRes.data : [];
    const stats = statsRes.success && statsRes.data ? statsRes.data : {
        totalOrders: 0,
        activeCount: 0,
        completedCount: 0,
        cancelledCount: 0,
        totalAmount: 0,
        activeAmount: 0,
        completedAmount: 0,
        pipelineAmount: 0,
        cancelledAmount: 0,
    } as {
        totalOrders: number; activeCount: number; completedCount: number; cancelledCount: number;
        totalAmount: number; activeAmount: number; completedAmount: number; pipelineAmount: number; cancelledAmount: number;
    };

    const serializedOrders = serializeData(orders);
    const displayedCount = Array.isArray(orders) ? orders.length : 0;
    const emptyMessage = isArchive ? salesLabels.emptyOrdersArchive : salesLabels.emptyOrders;

    const archiveHref = (() => {
        const q = new URLSearchParams();
        q.set('demand', 'legacy-internal');
        if (params?.startDate) q.set('startDate', params.startDate);
        if (params?.endDate) q.set('endDate', params.endDate);
        return `/sales/orders?${q.toString()}`;
    })();

    const mainListHref = (() => {
        const q = new URLSearchParams();
        if (params?.startDate) q.set('startDate', params.startDate);
        if (params?.endDate) q.set('endDate', params.endDate);
        const s = q.toString();
        return s ? `/sales/orders?${s}` : '/sales/orders';
    })();

    // Archive mode
    if (isArchive) {
        return (
            <div className="flex flex-col space-y-6 p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" asChild>
                            <Link href={mainListHref}>
                                <ArrowLeft className="mr-1 h-4 w-4" />
                                Kembali
                            </Link>
                        </Button>
                    </div>
                    <UrlTransactionDateFilter defaultPreset="all" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Archive className="h-7 w-7 text-muted-foreground" />
                        {salesLabels.archiveTitle}
                    </h1>
                    <p className="text-muted-foreground mt-1">{salesLabels.archiveHint}</p>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <p className="font-medium">{salesLabels.archiveHint}</p>
                    <p className="mt-1 text-amber-700">{salesLabels.archiveHintDetail}</p>
                </div>

                <Card>
                    <CardHeader className="pb-2">
                        <p className="text-sm text-muted-foreground">
                            {salesLabels.displayedCount}: <span className="font-semibold text-foreground">{displayedCount}</span>
                        </p>
                    </CardHeader>
                    <CardContent>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <SalesOrderTable initialData={serializedOrders as any} basePath="/sales/orders" emptyMessage={emptyMessage} />
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Single list + dropdown filters only
    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{salesLabels.salesOrders}</h1>
                    <p className="text-muted-foreground">{salesLabels.salesOrdersDesc}</p>
                </div>
                <div className="flex items-center gap-2">
                    <ContextualHelp
                        title="Panduan SO"
                        prefillQuestion="Cara membuat Sales Order di Polyflow?"
                        links={[
                            { title: 'Cara Buat Sales Order', slug: 'cara-buat-sales-order' },
                            { title: 'Cara Confirm SO Stok Kurang', slug: 'cara-confirm-so-stok-kurang' },
                            { title: 'Jadwal Kirim & Surat Jalan', slug: 'cara-jadwal-kirim-dan-surat-jalan' },
                        ]}
                    />
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                    <Button asChild>
                        <Link href="/sales/orders/create">
                            <Plus className="mr-2 h-4 w-4" />
                            {salesLabels.newSalesOrder}
                        </Link>
                    </Button>
                </div>
            </div>

            {/* P0 fix: period hint + pipeline omzet — original request "kalau semua terkonversi" */}
            <OrderPeriodHint start={checkStart} end={checkEnd} displayedCount={displayedCount} />

            {/* Omzet — money context */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="md:col-span-2 border-amber-200 bg-amber-50/40 dark:bg-amber-950/10">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Potensi Omzet (kalau semua terkirim)</CardTitle>
                        <Banknote className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah((stats as { pipelineAmount?: number }).pipelineAmount ?? (stats as { activeAmount?: number }).activeAmount ?? 0)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Order aktif non-batal dalam periode • {stats.activeCount} order
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Realisasi (Shipped/Delivered)</CardTitle>
                        <PackageIcon className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah((stats as { completedAmount?: number }).completedAmount ?? 0)}</div>
                        <p className="text-xs text-muted-foreground mt-1">{stats.completedCount} order</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Periode (gross, exc. batal)</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatRupiah(((stats as { totalAmount?: number; cancelledAmount?: number }).totalAmount != null && (stats as { cancelledAmount?: number }).cancelledAmount != null ? (stats as { totalAmount: number }).totalAmount - (stats as { cancelledAmount: number }).cancelledAmount : ((stats as { activeAmount?: number }).activeAmount ?? 0) + ((stats as { completedAmount?: number }).completedAmount ?? 0)))}</div>
                        <p className="text-xs text-muted-foreground mt-1">{stats.totalOrders} order (incl. batal {stats.cancelledCount})</p>
                    </CardContent>
                </Card>
            </div>

            {/* Counts */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{salesLabels.totalOrders}</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalOrders}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{salesLabels.activePending}</CardTitle>
                        <Clock className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{salesLabels.completed}</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.completedCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{salesLabels.cancelled}</CardTitle>
                        <XCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.cancelledCount}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <CardTitle>{salesLabels.allOrders}</CardTitle>
                            <span className="text-sm text-muted-foreground">
                                {salesLabels.displayedCount}: <span className="font-medium text-foreground">{displayedCount}</span>
                            </span>
                        </div>
                        <Suspense>
                            <SalesOrderFilters />
                        </Suspense>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <SalesOrderTable initialData={serializedOrders as any} basePath="/sales/orders" emptyMessage={emptyMessage} />
                </CardContent>
            </Card>

            <div className="text-center">
                <Link
                    href={archiveHref}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    {salesLabels.archiveLink}
                </Link>
            </div>
        </div>
    );
}
