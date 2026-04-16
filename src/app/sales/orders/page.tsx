import { getSalesOrders, getSalesOrderStats } from '@/actions/sales/sales';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, ShoppingCart, Clock, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { SalesOrderTable } from '@/components/sales/SalesOrderTable';
import { serializeData } from '@/lib/utils/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SalesOrderType } from '@prisma/client';

import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ startDate?: string, endDate?: string, demand?: 'customer' | 'legacy-internal', view?: 'mts-unpaid' }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);
    const demand = params?.demand || 'customer';
    const view = params?.view;
    const activeTab = view === 'mts-unpaid' ? 'mts-unpaid' : demand;

    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const buildDemandHref = (nextDemand: 'customer' | 'legacy-internal') => {
        const query = new URLSearchParams();
        query.set('demand', nextDemand);
        if (params?.startDate) query.set('startDate', params.startDate);
        if (params?.endDate) query.set('endDate', params.endDate);
        return `/sales/orders?${query.toString()}`;
    };

    const buildViewHref = (nextView: 'mts-unpaid') => {
        const query = new URLSearchParams();
        query.set('view', nextView);
        if (params?.startDate) query.set('startDate', params.startDate);
        if (params?.endDate) query.set('endDate', params.endDate);
        return `/sales/orders?${query.toString()}`;
    };

    // Pass date filter to fetch function
    const ordersRes = view === 'mts-unpaid'
        ? await getSalesOrders(true, { startDate: checkStart, endDate: checkEnd }, undefined, {
            orderType: SalesOrderType.MAKE_TO_STOCK,
            paymentState: 'outstanding'
        })
        : await getSalesOrders(true, { startDate: checkStart, endDate: checkEnd }, demand);
    const statsRes = await getSalesOrderStats();
    
    const orders = ordersRes.success && ordersRes.data ? ordersRes.data : [];
    const stats = statsRes.success && statsRes.data ? statsRes.data : {
        totalOrders: 0,
        activeCount: 0,
        completedCount: 0,
        cancelledCount: 0
    };

    // Serialize all Prisma objects for Client Components
    const serializedOrders = serializeData(orders);

    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Sales Orders</h1>
                    <p className="text-muted-foreground">Manage customer orders and shipments.</p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                    <Button asChild>
                        <Link href="/sales/orders/create">
                            <Plus className="mr-2 h-4 w-4" />
                            New Sales Order
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalOrders}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active / Pending</CardTitle>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Completed</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.completedCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
                        <XCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.cancelledCount}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-4">
                        <CardTitle>All Orders</CardTitle>
                        <Tabs value={activeTab} className="w-full">
                            <TabsList className="grid w-full grid-cols-3 md:w-[640px]">
                                <TabsTrigger value="customer" asChild>
                                    <Link href={buildDemandHref('customer')}>Customer Demand</Link>
                                </TabsTrigger>
                                <TabsTrigger value="legacy-internal" asChild>
                                    <Link href={buildDemandHref('legacy-internal')}>Legacy Internal</Link>
                                </TabsTrigger>
                                <TabsTrigger value="mts-unpaid" asChild>
                                    <Link href={buildViewHref('mts-unpaid')}>MTS Belum Lunas</Link>
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <SalesOrderTable initialData={serializedOrders as any} basePath="/sales/orders" />
                </CardContent>
            </Card>
        </div>
    );
}
