import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, ChevronRight, Activity, Clock, AlertCircle, Layers } from 'lucide-react';
import Link from 'next/link';
import { getProductionOrders, getProductionOrderStats } from '@/actions/production';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { Progress } from '@/components/ui/progress';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProductType } from '@prisma/client';

export default async function ProductionOrdersPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
    const { category } = await searchParams;

    let productTypes: ProductType[] | undefined;

    if (category === 'mixing') {
        productTypes = ['INTERMEDIATE'];
    } else if (category === 'extrusion') {
        productTypes = ['WIP', 'FINISHED_GOOD'];
    } else if (category === 'packing') {
        productTypes = ['PACKAGING'];
    }

    const orders = await getProductionOrders({ productTypes });
    const stats = await getProductionOrderStats();

    return (
        <div className="p-4 md:p-8 space-y-6">

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Create Work Order</h1>
                    <p className="text-muted-foreground mt-2">Plan a new manufacturing job</p>
                </div>
                <Link href="/planning/orders/create" className="w-full sm:w-auto">
                    <Button className="w-full sm:w-auto gap-2">
                        <Plus className="h-4 w-4" />
                        Create Order
                    </Button>
                </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                        <Layers className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalOrders}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">In Progress</CardTitle>
                        <Activity className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ready to Release</CardTitle>
                        <Clock className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.draftCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Late / Overdue</CardTitle>
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
                            <Link href="/planning/orders">All</Link>
                        </TabsTrigger>
                        <TabsTrigger value="mixing" asChild>
                            <Link href="/planning/orders?category=mixing">Mixing</Link>
                        </TabsTrigger>
                        <TabsTrigger value="extrusion" asChild>
                            <Link href="/planning/orders?category=extrusion">Extrusion</Link>
                        </TabsTrigger>
                        <TabsTrigger value="packing" asChild>
                            <Link href="/planning/orders?category=packing">Packing</Link>
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                <Card className="border shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <CardTitle>All Orders</CardTitle>
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <div className="relative w-full sm:w-auto">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search orders..."
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
                                        <TableHead>Order #</TableHead>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Machine</TableHead>
                                        <TableHead>Progress</TableHead>
                                        <TableHead>Planned</TableHead>
                                        <TableHead>Start Date</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {orders.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
                                                No orders found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        orders.map((order) => {
                                            const progress = (Number(order.actualQuantity || 0) / Number(order.plannedQuantity || 1)) * 100;

                                            return (
                                                <TableRow key={order.id} className="hover:bg-muted/50 group cursor-pointer">
                                                    <TableCell className="font-medium">
                                                        <Link href={`/planning/orders/${order.id}`} className="hover:underline text-foreground">
                                                            {order.orderNumber}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-medium text-foreground">{order.bom.productVariant.name}</div>
                                                        <div className="text-xs text-muted-foreground">{order.bom.name}</div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <StatusBadge status={order.status} />
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
                                                        {order.plannedQuantity.toLocaleString()} {order.bom.productVariant.primaryUnit}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {format(new Date(order.plannedStartDate), 'MMM dd, yyyy')}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Link href={`/planning/orders/${order.id}`}>
                                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                                                            </Button>
                                                        </Link>
                                                    </TableCell>
                                                </TableRow>
                                            )
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
