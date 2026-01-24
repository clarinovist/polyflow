'use client';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Eye } from 'lucide-react';
import Link from 'next/link';

interface DeliveryOrderTableProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialData: any[]; // Using any for serialized data to avoid complex type reconstruction on client
}

export function DeliveryOrderTable({ initialData }: DeliveryOrderTableProps) {
    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            PENDING: 'bg-yellow-100 text-yellow-800',
            SHIPPED: 'bg-blue-100 text-blue-800',
            DELIVERED: 'bg-green-100 text-green-800',
            RETURNED: 'bg-red-100 text-red-800',
            CANCELLED: 'bg-gray-100 text-gray-800',
        };
        return (
            <Badge variant="secondary" className={styles[status] || styles.PENDING}>
                {status}
            </Badge>
        );
    };

    return (
        <div className="rounded-md border">
            <ResponsiveTable minWidth={800}>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>DO Number</TableHead>
                            <TableHead>Sales Order</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Delivery Date</TableHead>
                            <TableHead>Source Location</TableHead>
                            <TableHead>Carrier</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {initialData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-24 text-center">
                                    No delivery orders found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            initialData.map((order) => (
                                <TableRow key={order.id}>
                                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
                                    <TableCell>
                                        <Link href={`/sales/orders/${order.salesOrderId}`} className="text-blue-600 hover:underline">
                                            {order.salesOrder?.orderNumber}
                                        </Link>
                                    </TableCell>
                                    <TableCell>{order.salesOrder?.customer?.name || '-'}</TableCell>
                                    <TableCell>{format(new Date(order.deliveryDate), 'PP')}</TableCell>
                                    <TableCell>{order.sourceLocation?.name}</TableCell>
                                    <TableCell>{order.carrier || '-'}</TableCell>
                                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" asChild>
                                            <Link href={`/sales/deliveries/${order.id}`}>
                                                <Eye className="h-4 w-4" />
                                            </Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </ResponsiveTable>
        </div>
    );
}
