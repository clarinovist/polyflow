import { Button } from '@/components/ui/button';
import { planningLabels } from '@/lib/labels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, ChevronRight, Activity, Clock, AlertCircle, Layers } from 'lucide-react';
import Link from 'next/link';
import { getProductionOrders, getProductionOrderStats } from '@/actions/production/production';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { Progress } from '@/components/ui/progress';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BomCategory } from '@prisma/client';
import { getEnteredQuantityDisplay } from '@/lib/utils/production-units';

export default async function ProductionOrdersPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
    const { category } = await searchParams;

    let bomCategories: BomCategory[] | undefined;

    if (category === 'mixing') {
        bomCategories = ['MIXING'];
    } else if (category === 'extrusion') {
        bomCategories = ['EXTRUSION'];
    } else if (category === 'packing') {
        bomCategories = ['PACKING'];
    }

    const orders = await getProductionOrders({ bomCategories });
    const stats = await getProductionOrderStats();

    const buildCategoryHref = (nextCategory?: string) => {
        return nextCategory ? `/production/orders?category=${nextCategory}` : '/production/orders';
    };

    return (
        <div className="p-4 md:p-8 space-y-6">

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">{planningLabels.createWorkOrder}</h1>
                    <p className="text-muted-foreground mt-2">{planningLabels.planNewJob}</p>
                </div>
                <Link href="/production/orders/create" className="w-full sm:w-auto">
                    <Button className="w-full sm:w-auto gap-2">
                        <Plus className="h-4 w-4" />
                        {planningLabels.createWorkOrder}
                    </Button>
                </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{planningLabels.totalOrders}</CardTitle>
                        <Layers className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalOrders}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{planningLabels.inProgress}</CardTitle>
                        <Activity className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{planningLabels.readyToRelease}</CardTitle>
                        <Clock className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.draftCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{planningLabels.lateOverdue}</CardTitle>
                        <AlertCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{stats.lateCount}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex flex-col gap-4">
                <Tabs defaultValue={category || 'all'} className="w-full">
                    <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
                        <TabsTrigger value="all" asChild>
                            <Link href={buildCategoryHref()}>{planningLabels.all}</Link>
                        </TabsTrigger>
                        <TabsTrigger value="mixing" asChild>
                            <Link href={buildCategoryHref('mixing')}>Mixing</Link>
                        </TabsTrigger>
                        <TabsTrigger value="extrusion" asChild>
                            <Link href={buildCategoryHref('extrusion')}>Extrusion</Link>
                        </TabsTrigger>
                        <TabsTrigger value="packing" asChild>
                            <Link href={buildCategoryHref('packing')}>Packing</Link>
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                <Card className="border shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <CardTitle>{planningLabels.allOrders}</CardTitle>
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <div className="relative w-full sm:w-auto">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder={planningLabels.searchOrders}
                                        className="pl-9 w-full sm:w-[250px]"
                                    />
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border overflow-x-auto custom-scrollbar">
                            <Table className="min-w-[800px]">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{planningLabels.orderNumber}</TableHead>
                                        <TableHead>{planningLabels.product}</TableHead>
                                        <TableHead>{planningLabels.status}</TableHead>
                                        <TableHead>{planningLabels.demandSource}</TableHead>
                                        <TableHead>{planningLabels.machine}</TableHead>
                                        <TableHead>{planningLabels.progress}</TableHead>
                                        <TableHead>{planningLabels.planned}</TableHead>
                                        <TableHead>{planningLabels.startDate}</TableHead>
                                        <TableHead className="text-right">{planningLabels.actions}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {orders.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center h-24 text-muted-foreground">
                                                Tidak ada order ditemukan.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        orders.map((order) => {
                                            const progress = (Number(order.actualQuantity || 0) / Number(order.plannedQuantity || 1)) * 100;

                                            return (
                                                <TableRow key={order.id} className="hover:bg-muted/50 group cursor-pointer">
                                                    <TableCell className="font-medium">
                                                        <Link href={`/production/orders/${order.id}`} className="hover:underline text-foreground">
                                                            {order.orderNumber}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <div className="font-medium text-foreground">{order.bom.productVariant.name}</div>
                                                            {order.priority === "URGENT" && (
                                                                <Badge variant="destructive" className="text-[10px] py-0 h-4">URGENT</Badge>
                                                            )}
                                                            {order.priority === "LOW" && (
                                                                <Badge variant="outline" className="text-[10px] py-0 h-4 text-muted-foreground">LOW</Badge>
                                                            )}
                                                            {order.isMaklon && (
                                                                <Badge variant="outline" className="text-[10px] py-0 h-4 border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                                                                    Maklon
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">{order.bom.name}</div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <StatusBadge status={order.status} />
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1">
                                                            {order.salesOrder ? (
                                                                <>
                                                                    <span className="text-sm font-medium">{order.salesOrder.customer?.name || order.salesOrder.orderNumber}</span>
                                                                    <span className="text-xs text-muted-foreground">{order.salesOrder.orderNumber} • {order.salesOrder.orderType.replace(/_/g, ' ')}</span>
                                                                </>
                                                            ) : (
                                                                <Badge variant="secondary" className="text-xs font-normal w-fit">
                                                                    {planningLabels.internalStockBuildLabel}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {order.machine ? (
                                                            <Badge variant="secondary" className="font-normal text-xs">
                                                                {order.machine.code}
                                                            </Badge>
                                                        ) : <span className="text-muted-foreground">-</span>}
                                                    </TableCell>
                                                    <TableCell className="w-[150px]">
                                                        <div className="flex items-center gap-2">
                                                            <Progress value={Math.min(progress, 100)} className="h-2 w-16" />
                                                            <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {getEnteredQuantityDisplay({
                                                            ...order.bom.productVariant,
                                                            quantity: order.plannedQuantity,
                                                            enteredQuantity: order.plannedEnteredQuantity,
                                                            enteredUnit: order.plannedEnteredUnit,
                                                            conversionFactorSnapshot: order.plannedConversionFactorSnapshot,
                                                        })}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {format(new Date(order.plannedStartDate), 'MMM dd, yyyy')}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Link href={`/production/orders/${order.id}`}>
                                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                                                            </Button>
                                                        </Link>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
        DRAFT: "secondary",
        RELEASED: "outline",
        IN_PROGRESS: "default",
        COMPLETED: "secondary",
        CANCELLED: "destructive",
        WAITING_MATERIAL: "outline",
    };

    return (
        <Badge variant={STATUS_VARIANTS[status] || "secondary"} className="shadow-none font-medium">
            {status.replace('_', ' ')}
        </Badge>
    );
}
