'use client';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils';
import { format } from 'date-fns';
import { SalesOrder, SalesOrderStatus, Customer, Location } from '@prisma/client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileText } from 'lucide-react';

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
}

export function SalesOrderTable({ initialData }: SalesOrderTableProps) {

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
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Items</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {initialData.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={8} className="h-24 text-center">
                                No sales orders found.
                            </TableCell>
                        </TableRow>
                    ) : (
                        initialData.map((order) => (
                            <TableRow key={order.id}>
                                <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                        {order.orderNumber}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {format(new Date(order.orderDate), 'MMM d, yyyy')}
                                </TableCell>
                                <TableCell>{order.customer?.name || 'Internal / MTS'}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="font-normal">
                                        {order.sourceLocation?.name || '-'}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="secondary" className={getStatusColor(order.status)}>
                                        {order.status.replace(/_/g, ' ')}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                    {order.totalAmount ? formatRupiah(Number(order.totalAmount)) : '-'}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground">
                                    {order._count.items}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button asChild variant="ghost" size="icon">
                                        <Link href={`/dashboard/sales/${order.id}`}>
                                            <ArrowRight className="h-4 w-4" />
                                        </Link>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
