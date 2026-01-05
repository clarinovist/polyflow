import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { getProductionOrders } from '@/actions/production';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default async function ProductionOrdersPage() {
    const orders = await getProductionOrders();

    return (
        <div className="p-8 space-y-6">


            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Production Orders</h1>
                    <p className="text-slate-600 mt-2">Manage and track all production jobs</p>
                </div>
                <Link href="/dashboard/production/orders/create">
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Create Order
                    </Button>
                </Link>
            </div>

            <Card className="border-none shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle>All Orders</CardTitle>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Search orders..."
                                    className="pl-9 w-[250px]"
                                />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Order #</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Machine</TableHead>
                                    <TableHead>Location</TableHead>
                                    <TableHead>Planned</TableHead>
                                    <TableHead>Start Date</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center h-24 text-slate-500">
                                            No orders found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    orders.map((order) => (
                                        <TableRow key={order.id} className="hover:bg-slate-50 group cursor-pointer">
                                            <TableCell className="font-medium">
                                                <Link href={`/dashboard/production/orders/${order.id}`} className="hover:underline text-blue-600">
                                                    {order.orderNumber}
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-medium text-slate-900">{order.bom.productVariant.name}</div>
                                                <div className="text-xs text-slate-500">{order.bom.name}</div>
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge status={order.status} />
                                            </TableCell>
                                            <TableCell>
                                                {order.machine ? (
                                                    <Badge variant="secondary" className="font-normal text-xs">
                                                        {order.machine.code}
                                                    </Badge>
                                                ) : <span className="text-slate-400">-</span>}
                                            </TableCell>
                                            <TableCell className="text-slate-600 font-medium text-xs">
                                                {order.location.name}
                                            </TableCell>
                                            <TableCell>
                                                {order.plannedQuantity.toLocaleString()} {order.bom.productVariant.primaryUnit}
                                            </TableCell>
                                            <TableCell className="text-slate-600">
                                                {format(new Date(order.plannedStartDate), 'MMM dd, yyyy')}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Link href={`/dashboard/production/orders/${order.id}`}>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
                                                    </Button>
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        DRAFT: "bg-slate-100 text-slate-700 hover:bg-slate-100",
        RELEASED: "bg-blue-100 text-blue-700 hover:bg-blue-100",
        IN_PROGRESS: "bg-amber-100 text-amber-700 hover:bg-amber-100",
        COMPLETED: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
        CANCELLED: "bg-red-100 text-red-700 hover:bg-red-100",
    };

    return (
        <Badge className={cn(styles[status] || styles.DRAFT, "border-0 shadow-none font-medium")}>
            {status.replace('_', ' ')}
        </Badge>
    );
}
