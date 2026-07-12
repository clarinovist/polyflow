import { getSalesOrders, getSalesOrderStats } from '@/actions/sales/sales';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, ShoppingCart, Clock, CheckCircle, XCircle, Archive, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { SalesOrderTable } from '@/components/sales/SalesOrderTable';
import { SalesOrderFilters } from '@/components/sales/SalesOrderFilters';
import { serializeData } from '@/lib/utils/utils';
import { SalesOrderType, SalesOrderStatus } from '@prisma/client';
import { salesLabels } from '@/lib/labels';

import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { Suspense } from 'react';

type QuickView = 'all' | 'unpaid' | 'ready' | 'from-stock-unpaid' | 'archive';

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

/** Preserve date + view params across quick-view hrefs */
function buildViewHref(
    nextView: QuickView,
    params: { startDate?: string; endDate?: string },
    currentFilters: { status?: string; fulfill?: string; payment?: string }
) {
    const query = new URLSearchParams();
    if (nextView === 'archive') {
        query.set('demand', 'legacy-internal');
    } else if (nextView === 'from-stock-unpaid') {
        query.set('view', 'mts-unpaid');
    } else if (nextView === 'all') {
        // default
    } else {
        query.set('view', nextView);
    }
    // Preserve filters
    if (currentFilters.status) query.set('status', currentFilters.status);
    if (currentFilters.fulfill) query.set('fulfill', currentFilters.fulfill);
    if (currentFilters.payment) query.set('payment', currentFilters.payment);
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);
    return `/sales/orders?${query.toString()}`;
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string, demand?: string, view?: string, status?: string, fulfill?: string, payment?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);

    // Resolve quick view from URL (backward compat)
    const viewParam = params?.view;
    const demandParam = params?.demand;
    const activeView: QuickView =
        viewParam === 'mts-unpaid' ? 'from-stock-unpaid' :
        viewParam === 'archive' || demandParam === 'legacy-internal' ? 'archive' :
        viewParam === 'unpaid' ? 'unpaid' :
        viewParam === 'ready' ? 'ready' :
        'all';

    // Parse orthogonal filters
    const currentFilters = {
        status: params?.status || '',
        fulfill: params?.fulfill || '',
        payment: params?.payment || '',
    };

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    // Build href for each quick view (preserves current filters)
    const href = (v: QuickView) => buildViewHref(v, { startDate: params?.startDate, endDate: params?.endDate }, currentFilters);

    // Resolve filter values for backend
    const fulfillTypes = fulfillToOrderTypes(currentFilters.fulfill);
    const statusList = parseStatusFilter(currentFilters.status);

    // Build extra filters for the fetch
    const buildExtraFilters = () => {
        const extra: Parameters<typeof getSalesOrders>[3] = {};
        if (fulfillTypes) extra.orderTypes = fulfillTypes;
        if (statusList) extra.statusFilter = statusList;
        if (currentFilters.payment) extra.paymentState = currentFilters.payment as 'outstanding' | 'paid' | 'no_invoice';
        return extra;
    };

    // Fetch data based on active view + orthogonal filters
    const isArchive = activeView === 'archive';
    const ordersRes = activeView === 'from-stock-unpaid'
        ? await getSalesOrders(true, { startDate: checkStart, endDate: checkEnd }, undefined, {
            ...buildExtraFilters(),
            // from-stock-unpaid always adds MAKE_TO_STOCK + outstanding
            orderTypes: fulfillTypes ?? [SalesOrderType.MAKE_TO_STOCK],
            paymentState: currentFilters.payment ? currentFilters.payment as 'outstanding' | 'paid' | 'no_invoice' : 'outstanding',
        })
        : isArchive
        ? await getSalesOrders(true, { startDate: checkStart, endDate: checkEnd }, 'legacy-internal')
        : activeView === 'unpaid'
        ? await getSalesOrders(true, { startDate: checkStart, endDate: checkEnd }, 'customer', {
            ...buildExtraFilters(),
            paymentState: currentFilters.payment ? currentFilters.payment as 'outstanding' | 'paid' | 'no_invoice' : 'outstanding',
        })
        : await getSalesOrders(true, { startDate: checkStart, endDate: checkEnd }, 'customer', buildExtraFilters());

    const statsRes = await getSalesOrderStats();

    const orders = ordersRes.success && ordersRes.data ? ordersRes.data : [];
    const stats = statsRes.success && statsRes.data ? statsRes.data : {
        totalOrders: 0,
        activeCount: 0,
        completedCount: 0,
        cancelledCount: 0
    };

    const serializedOrders = serializeData(orders);

    // Context-aware empty message per quick view
    const emptyMessage = isArchive
        ? salesLabels.emptyOrdersArchive
        : activeView === 'unpaid'
        ? salesLabels.emptyOrdersUnpaid
        : activeView === 'ready'
        ? salesLabels.emptyOrdersReady
        : activeView === 'from-stock-unpaid'
        ? salesLabels.emptyOrdersFromStockUnpaid
        : salesLabels.emptyOrders;

    // Quick view chips config
    const quickViews: { key: QuickView; label: string; href: string }[] = [
        { key: 'all', label: salesLabels.quickViewAll, href: href('all') },
        { key: 'unpaid', label: salesLabels.quickViewUnpaid, href: href('unpaid') },
        { key: 'ready', label: salesLabels.quickViewReady, href: href('ready') },
        { key: 'from-stock-unpaid', label: salesLabels.quickViewFromStockUnpaid, href: href('from-stock-unpaid') },
    ];

    // Archive mode
    if (isArchive) {
        return (
            <div className="flex flex-col space-y-6 p-6">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href={href('all')}>
                            <ArrowLeft className="mr-1 h-4 w-4" />
                            Kembali
                        </Link>
                    </Button>
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
                    <CardContent className="pt-6">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <SalesOrderTable initialData={serializedOrders as any} basePath="/sales/orders" emptyMessage={emptyMessage} />
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Default / quick-view mode
    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{salesLabels.salesOrders}</h1>
                    <p className="text-muted-foreground">{salesLabels.salesOrdersDesc}</p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                    <Button asChild>
                        <Link href="/sales/orders/create">
                            <Plus className="mr-2 h-4 w-4" />
                            {salesLabels.newSalesOrder}
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
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
                        <CardTitle>{salesLabels.allOrders}</CardTitle>
                        {/* Quick view chips */}
                        <div className="flex flex-wrap gap-2">
                            {quickViews.map((qv) => (
                                <Link
                                    key={qv.key}
                                    href={qv.href}
                                    className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                        activeView === qv.key
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {qv.label}
                                </Link>
                            ))}
                        </div>
                        {/* Orthogonal filters */}
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

            {/* Archive link */}
            <div className="text-center">
                <Link
                    href={href('archive')}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    {salesLabels.archiveLink}
                </Link>
            </div>
        </div>
    );
}
