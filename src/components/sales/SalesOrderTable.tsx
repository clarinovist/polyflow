'use client';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils';
import { format } from 'date-fns';
import { SalesOrder, SalesOrderStatus, Customer, Location } from '@prisma/client';
import { FileText, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { useRouter } from '@/i18n/navigation';

// Helper types that match the structure of what's passed from server page
type SerializedSalesOrder = Omit<SalesOrder, 'totalAmount'> & {
    totalAmount: number | null;
    customer: (Omit<Customer, 'creditLimit' | 'discountPercent'> & {
        creditLimit: number | null;
        discountPercent: number | null;
    }) | null;
    sourceLocation: Location | null;
    _count: { items: number };
};

interface SalesOrderTableProps {
    initialData: SerializedSalesOrder[];
    basePath?: string;
}

export function SalesOrderTable({ initialData, basePath = '/sales/orders' }: SalesOrderTableProps) {
    const router = useRouter();

    const getStatusColor = (status: SalesOrderStatus) => {
        switch (status) {
            case 'DRAFT': return 'bg-slate-100 text-slate-800 border-slate-200';
            case 'CONFIRMED': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'IN_PRODUCTION': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'READY_TO_SHIP': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
            case 'SHIPPED': return 'bg-purple-100 text-purple-800 border-purple-200';
            case 'DELIVERED': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'CANCELLED': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-slate-100 text-slate-800';
        }
    };

    return (
        <div className="rounded-md border-none sm:border">
            {/* Desktop Table View */}
            <div className="hidden md:block">
                <ResponsiveTable minWidth={800}>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Order #</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead className="hidden md:table-cell">Location</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right hidden sm:table-cell">Items</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {initialData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        No sales orders found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                initialData.map((order) => (
                                    <TableRow
                                        key={order.id}
                                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        onClick={() => router.push(`${basePath}/${order.id}` as any)}
                                    >
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <FileText className="h-4 w-4 text-muted-foreground" />
                                                {order.orderNumber}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {format(new Date(order.orderDate), 'MMM d, yyyy')}
                                        </TableCell>
                                        <TableCell>
                                            {order.customer?.name || 'Internal / MTS'}
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            <Badge variant="outline" className="font-normal">
                                                {order.sourceLocation?.name || '-'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className={getStatusColor(order.status)}>
                                                {order.status.replace(/_/g, ' ')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground hidden sm:table-cell">
                                            {order._count.items}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {order.totalAmount ? formatRupiah(Number(order.totalAmount)) : '-'}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </ResponsiveTable>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
                {initialData.length === 0 ? (
                    <div className="text-center p-4 text-muted-foreground border rounded-lg border-dashed">
                        No sales orders found.
                    </div>
                ) : (
                    initialData.map((order) => (
                        <Card
                            key={order.id}
                            className="overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onClick={() => router.push(`${basePath}/${order.id}` as any)}
                        >
                            <CardHeader className="p-4 pb-2">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-primary/10 p-1.5 rounded-full">
                                            <FileText className="h-4 w-4 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-sm">{order.orderNumber}</h3>
                                            <p className="text-xs text-muted-foreground">{format(new Date(order.orderDate), 'MMM d, yyyy')}</p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className={`text-[10px] px-1.5 h-5 ${getStatusColor(order.status)}`}>
                                        {order.status.replace(/_/g, ' ')}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 pt-1">
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Customer</p>
                                            <p className="font-medium truncate">{order.customer?.name || 'Internal / MTS'}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total</p>
                                            <p className="font-semibold text-primary">
                                                {order.totalAmount ? formatRupiah(Number(order.totalAmount)) : '-'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground text-[11px]">
                                        <div className="flex items-center gap-1">
                                            <Badge variant="outline" className="h-4 px-1 rounded-sm text-[9px] font-normal">
                                                {order.sourceLocation?.name || '-'}
                                            </Badge>
                                            <span>• {order._count.items} Items</span>
                                        </div>
                                        <div className="flex items-center text-primary font-medium">
                                            View Details <ChevronRight className="h-3 w-3 ml-0.5" />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div >
    );
}
