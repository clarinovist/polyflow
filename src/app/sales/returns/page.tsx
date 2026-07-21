import { getSalesReturns } from '@/actions/sales/sales-returns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { salesLabels } from '@/lib/labels';
import { Plus, RotateCcw, Clock, CheckCircle, XCircle, Banknote } from 'lucide-react';
import Link from 'next/link';
import { SalesReturnTable } from '@/components/sales/SalesReturnTable';
import { serializeData, formatRupiah } from '@/lib/utils/utils';
import { SalesReturnStatus } from '@prisma/client';
import { UrlTransactionDateFilter } from '@/components/common/url-transaction-date-filter';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export default async function SalesReturnsPage({ searchParams }: { searchParams: Promise<{ search?: string, status?: SalesReturnStatus, startDate?: string, endDate?: string }> }) {
    const params = await searchParams;
    const now = new Date();
    const defaultStart = startOfMonth(now);
    const defaultEnd = endOfMonth(now);
    const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
    const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

    const returnsRes = await getSalesReturns({
        search: params?.search,
        status: params?.status,
        startDate: checkStart,
        endDate: checkEnd,
    });

    const returns = returnsRes.success && returnsRes.data ? returnsRes.data : [];
    const serializedReturns = serializeData(returns);

    const totalReturns = returns.length;
    const activeCount = returns.filter(r => ['DRAFT', 'CONFIRMED', 'RECEIVED'].includes(r.status)).length;
    const completedCount = returns.filter(r => r.status === 'COMPLETED').length;
    const cancelledCount = returns.filter(r => r.status === 'CANCELLED').length;

    // P1: sum retur — nilai total retur dalam periode
    const totalAmount = returns.reduce((acc, r) => {
        const v = r as unknown as { totalAmount?: unknown };
        return acc + Number((v.totalAmount as never) ?? 0);
    }, 0);

    const periodLabel = `${format(checkStart, 'd MMM', { locale: idLocale })} – ${format(checkEnd, 'd MMM yyyy', { locale: idLocale })}`;

    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{salesLabels.salesReturns}</h1>
                    <p className="text-muted-foreground">{salesLabels.salesReturnsDesc} • Periode: {periodLabel}</p>
                    <p className="text-xs text-muted-foreground mt-1">Scope: returnDate ikut filter. Total retur di bawah = periode ini saja.</p>
                </div>
                <div className="flex items-center gap-2">
                    <UrlTransactionDateFilter defaultPreset="this_month" />
                    <Button asChild>
                        <Link href="/sales/returns/create">
                            <Plus className="mr-2 h-4 w-4" />
                            {salesLabels.newSalesReturn}
                        </Link>
                    </Button>
                </div>
            </div>

            {/* P1: counts + total nilai */}
            <div className="grid gap-4 md:grid-cols-5">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{salesLabels.totalReturns}</CardTitle>
                        <RotateCcw className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalReturns}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{salesLabels.activePending}</CardTitle>
                        <Clock className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{salesLabels.completed}</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{completedCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{salesLabels.cancelled}</CardTitle>
                        <XCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{cancelledCount}</div>
                    </CardContent>
                </Card>
                <Card className="border-rose-200 bg-rose-50/40 dark:bg-rose-950/10">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Nilai Retur Periode</CardTitle>
                        <Banknote className="h-4 w-4 text-rose-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">{formatRupiah(totalAmount)}</div>
                        <p className="text-xs text-muted-foreground mt-1">{periodLabel}</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{salesLabels.allReturns}</CardTitle>
                </CardHeader>
                <CardContent>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <SalesReturnTable initialData={serializedReturns as any} basePath="/sales/returns" />
                </CardContent>
            </Card>
        </div>
    );
}
