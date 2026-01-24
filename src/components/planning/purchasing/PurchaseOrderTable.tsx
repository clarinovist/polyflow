'use client';

import React, { useState, useMemo } from 'react';
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Search,
    Plus,
    Eye
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { formatRupiah } from '@/lib/utils';
import { PurchaseOrderStatus } from '@prisma/client';

type POWithRelations = {
    id: string;
    orderNumber: string;
    orderDate: Date;
    expectedDate: Date | null;
    status: PurchaseOrderStatus;
    totalAmount: number | null;
    supplier: {
        name: string;
        code: string | null;
    };
    _count: {
        items: number;
    };
};

interface PurchaseOrderTableProps {
    orders: POWithRelations[];
}

export function PurchaseOrderTable({ orders }: PurchaseOrderTableProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            const matchesSearch =
                order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.supplier.name.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [orders, searchTerm, statusFilter]);

    const getStatusBadge = (status: PurchaseOrderStatus) => {
        switch (status) {
            case 'DRAFT':
                return <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200">Draft</Badge>;
            case 'SENT':
                return <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">Sent</Badge>;
            case 'PARTIAL_RECEIVED':
                return <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">Partial</Badge>;
            case 'RECEIVED':
                return <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">Received</Badge>;
            case 'CANCELLED':
                return <Badge variant="destructive">Cancelled</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search PO number or supplier..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="h-9 w-[150px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                        <option value="all">All Status</option>
                        {Object.values(PurchaseOrderStatus).map(status => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>
                    <Link href="/planning/purchase-orders/create">
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="mr-2 h-4 w-4" />
                            Create PO
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="rounded-md border bg-background overflow-x-auto">
                <ResponsiveTable minWidth={800}>
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead className="w-[150px]">PO Number</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead>Order Date</TableHead>
                                <TableHead>Expected</TableHead>
                                <TableHead className="text-right">Total Amount</TableHead>
                                <TableHead className="text-center">Items</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-[100px] text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredOrders.length > 0 ? (
                                filteredOrders.map((order) => (
                                    <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                                        <TableCell className="font-mono font-medium text-blue-600">
                                            <Link href={`/planning/purchase-orders/${order.id}`} className="hover:underline">
                                                {order.orderNumber}
                                            </Link>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{order.supplier.name}</span>
                                                {order.supplier.code && (
                                                    <span className="text-[10px] text-muted-foreground uppercase">{order.supplier.code}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {format(new Date(order.orderDate), 'dd MMM yyyy')}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {order.expectedDate ? format(new Date(order.expectedDate), 'dd MMM yyyy') : '-'}
                                        </TableCell>
                                        <TableCell className="text-right font-medium tabular-nums">
                                            {formatRupiah(order.totalAmount || 0)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="secondary" className="font-normal">
                                                {order._count.items} items
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {getStatusBadge(order.status)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Link href={`/planning/purchase-orders/${order.id}`}>
                                                <Button variant="ghost" size="sm">
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                                        No purchase orders found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </ResponsiveTable>
            </div>
        </div>
    );
}
