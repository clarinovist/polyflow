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
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { formatRupiah } from '@/lib/utils';
import { PurchaseInvoiceStatus } from '@prisma/client';
import Link from 'next/link';

type InvoiceWithRelations = {
    id: string;
    invoiceNumber: string;
    invoiceDate: Date;
    dueDate: Date;
    status: PurchaseInvoiceStatus;
    totalAmount: number;
    paidAmount: number;
    purchaseOrder: {
        orderNumber: string;
        supplier: {
            name: string;
        };
    };
};

interface PurchaseInvoiceTableProps {
    invoices: InvoiceWithRelations[];
}

export function PurchaseInvoiceTable({ invoices }: PurchaseInvoiceTableProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredInvoices = useMemo(() => {
        return invoices.filter(inv =>
            inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.purchaseOrder.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.purchaseOrder.supplier.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [invoices, searchTerm]);

    const getStatusBadge = (status: PurchaseInvoiceStatus) => {
        const styles: Record<string, string> = {
            UNPAID: 'bg-red-100 text-red-800 border-red-200',
            PARTIAL: 'bg-amber-100 text-amber-800 border-amber-200',
            PAID: 'bg-emerald-100 text-emerald-800 border-emerald-200',
            OVERDUE: 'bg-red-100 text-red-800 border-red-200',
        };
        return (
            <Badge variant="outline" className={styles[status]}>
                {status}
            </Badge>
        );
    };

    return (
        <div className="space-y-4">
            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search invoice, PO, or supplier..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                />
            </div>

            <div className="rounded-md border bg-background overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="w-[150px]">Invoice No</TableHead>
                            <TableHead>Supplier</TableHead>
                            <TableHead>PO Ref</TableHead>
                            <TableHead>Invoice Date</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead className="text-right">Total Amount</TableHead>
                            <TableHead className="text-right">Paid Amount</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredInvoices.length > 0 ? (
                            filteredInvoices.map((inv) => (
                                <TableRow key={inv.id} className="hover:bg-muted/30 transition-colors">
                                    <TableCell className="font-mono font-medium">
                                        <Link
                                            href={`/dashboard/purchasing/invoices/${inv.id}`}
                                            className="text-slate-900 hover:text-blue-600 hover:underline"
                                        >
                                            {inv.invoiceNumber}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {inv.purchaseOrder.supplier.name}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="font-mono text-[10px]">
                                            {inv.purchaseOrder.orderNumber}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {format(new Date(inv.invoiceDate), 'dd MMM yyyy')}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        <div className={`flex items-center gap-2 ${new Date(inv.dueDate) < new Date() && inv.status !== 'PAID' ? 'text-red-600 font-bold' : ''}`}>
                                            <Calendar className="h-3 w-3" />
                                            {format(new Date(inv.dueDate), 'dd MMM yyyy')}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {formatRupiah(inv.totalAmount)}
                                    </TableCell>
                                    <TableCell className="text-right text-emerald-600 font-medium">
                                        {formatRupiah(inv.paidAmount)}
                                    </TableCell>
                                    <TableCell>
                                        {getStatusBadge(inv.status)}
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                                    No purchase invoices found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
