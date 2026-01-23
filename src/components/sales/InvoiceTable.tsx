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
import { formatRupiah } from '@/lib/utils';
import { format } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { InvoiceStatus } from '@prisma/client';

interface InvoiceTableProps {
    invoices: {
        id: string;
        invoiceNumber: string;
        invoiceDate: Date | string;
        dueDate?: Date | string | null;
        totalAmount: number;
        paidAmount: number;
        status: InvoiceStatus;
        salesOrderId: string;
        salesOrder: {
            orderNumber: string;
            customer: { name: string; } | null;
        };
    }[];
}

export function InvoiceTable({ invoices }: InvoiceTableProps) {

    const getStatusBadge = (status: InvoiceStatus) => {
        const styles: Record<string, string> = {
            UNPAID: 'bg-slate-100 text-slate-800',
            PAID: 'bg-emerald-100 text-emerald-800',
            PARTIALLY_PAID: 'bg-amber-100 text-amber-800',
            OVERDUE: 'bg-red-100 text-red-800 border-red-200',
            CANCELLED: 'bg-red-50 text-red-500',
        };
        return (
            <Badge variant="secondary" className={styles[status] || styles.UNPAID}>
                {status.replace(/_/g, ' ')}
            </Badge>
        );
    };

    return (
        <div className="rounded-md border">
            <ResponsiveTable minWidth={800}>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Invoice #</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Sales Order</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {invoices.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
                                    No invoices found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            invoices.map((invoice) => (
                                <TableRow key={invoice.id}>
                                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                                    <TableCell>{format(new Date(invoice.invoiceDate), 'PP')}</TableCell>
                                    <TableCell>
                                        <span className={invoice.status === ('OVERDUE' as InvoiceStatus) ? 'text-red-600 font-bold' : ''}>
                                            {invoice.dueDate ? format(new Date(invoice.dueDate), 'PP') : '-'}
                                        </span>
                                    </TableCell>
                                    <TableCell>{invoice.salesOrder.customer?.name || 'Internal / MTS'}</TableCell>
                                    <TableCell>
                                        <Link href={`/dashboard/sales/${invoice.salesOrderId}`} className="text-blue-600 hover:underline">
                                            {invoice.salesOrder.orderNumber}
                                        </Link>
                                    </TableCell>
                                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                                    <TableCell className="text-right font-medium">
                                        {formatRupiah(Number(invoice.totalAmount))}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" asChild>
                                            <Link href={`/dashboard/sales/${invoice.salesOrderId}`}>
                                                View <ArrowRight className="ml-2 h-4 w-4" />
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
