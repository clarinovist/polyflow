import type { ComponentProps } from 'react';
import { getPurchaseReturns } from '@/actions/purchasing/purchase-returns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ListResultSummary } from '@/components/ui/list-result-summary';
import { Plus, RotateCcw, Clock, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { PurchaseReturnTable } from '@/components/purchasing/PurchaseReturnTable';
import { serializeData } from '@/lib/utils/utils';
import { PurchaseReturnStatus } from '@prisma/client';
import { planningLabels } from '@/lib/labels';

export default async function PurchaseReturnsPage({
    searchParams,
}: {
    searchParams: Promise<{ search?: string; status?: PurchaseReturnStatus }>;
}) {
    const params = await searchParams;

    // Fetch returns
    const returnsRes = await getPurchaseReturns({
        search: params?.search,
        status: params?.status,
    });
    if (!returnsRes.success) {
        return (
            <div className="space-y-4 p-6">
                <h1 className="text-3xl font-bold tracking-tight">
                    {planningLabels.purchaseReturns}
                </h1>
                <p role="alert" className="text-destructive">
                    {returnsRes.error || 'Gagal memuat retur pembelian.'}
                </p>
                <p className="text-sm text-muted-foreground">
                    Muat ulang halaman untuk mencoba lagi.
                </p>
            </div>
        );
    }

    const returns = returnsRes.data ?? [];

    // Serialize all Prisma objects for Client Components
    const serializedReturns = serializeData(returns);

    // Quick stats calculation
    const totalReturns = returns.length;
    const activeCount = returns.filter((r) =>
        ['DRAFT', 'CONFIRMED', 'SHIPPED'].includes(r.status),
    ).length;
    const completedCount = returns.filter(
        (r) => r.status === 'COMPLETED',
    ).length;
    const cancelledCount = returns.filter(
        (r) => r.status === 'CANCELLED',
    ).length;

    return (
        <div className="flex flex-col space-y-6 p-6">
            <PageHeader
                title={planningLabels.purchaseReturns}
                description={planningLabels.purchaseReturnsDesc}
                actions={
                    <Button asChild>
                        <Link href="/purchasing/returns/create">
                            <Plus aria-hidden="true" className="h-4 w-4" />
                            {planningLabels.newPurchaseReturn}
                        </Link>
                    </Button>
                }
            />

            <ListResultSummary
                start={returns.length > 0 ? 1 : 0}
                end={returns.length}
                total={returns.length}
            />

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {planningLabels.totalReturns}
                        </CardTitle>
                        <RotateCcw className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalReturns}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {planningLabels.activePending}
                        </CardTitle>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {planningLabels.completed}
                        </CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {completedCount}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {planningLabels.cancelled}
                        </CardTitle>
                        <XCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {cancelledCount}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{planningLabels.allReturns}</CardTitle>
                </CardHeader>
                <CardContent>
                    <PurchaseReturnTable
                        initialData={
                            serializedReturns as unknown as ComponentProps<
                                typeof PurchaseReturnTable
                            >['initialData']
                        }
                        basePath="/purchasing/returns"
                    />
                </CardContent>
            </Card>
        </div>
    );
}
