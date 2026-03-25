import { getPurchaseReturns } from '@/actions/purchasing/purchase-returns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, RotateCcw, Clock, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { PurchaseReturnTable } from '@/components/purchasing/PurchaseReturnTable';
import { serializeData } from '@/lib/utils/utils';
import { PurchaseReturnStatus } from '@prisma/client';

export default async function PurchaseReturnsPage({ searchParams }: { searchParams: Promise<{ search?: string, status?: PurchaseReturnStatus }> }) {
    const params = await searchParams;

    // Fetch returns
    const returns = await getPurchaseReturns({ 
        search: params?.search,
        status: params?.status 
    });

    // Serialize all Prisma objects for Client Components
    const serializedReturns = serializeData(returns);
    
    // Quick stats calculation
    const totalReturns = returns.length;
    const activeCount = returns.filter(r => ['DRAFT', 'CONFIRMED', 'SHIPPED'].includes(r.status)).length;
    const completedCount = returns.filter(r => r.status === 'COMPLETED').length;
    const cancelledCount = returns.filter(r => r.status === 'CANCELLED').length;

    return (
        <div className="flex flex-col space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Purchase Returns</h1>
                    <p className="text-muted-foreground">Manage returns to suppliers and outward shipments.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button asChild>
                        <Link href="/planning/purchase-returns/create">
                            <Plus className="mr-2 h-4 w-4" />
                            New Purchase Return
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Returns</CardTitle>
                        <RotateCcw className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalReturns}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active / Pending</CardTitle>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Completed</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{completedCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
                        <XCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{cancelledCount}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All Returns</CardTitle>
                </CardHeader>
                <CardContent>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <PurchaseReturnTable initialData={serializedReturns as any} basePath="/planning/purchase-returns" />
                </CardContent>
            </Card>
        </div>
    );
}
