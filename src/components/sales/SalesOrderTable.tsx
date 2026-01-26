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
import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
        <div className="rounded-md border">
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
                                    onClick={() => router.push(`${basePath}/${order.id}`)}
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
        </div >
    );
}
