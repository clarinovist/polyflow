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
import { Search, Calendar, Trash2, Loader2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { formatRupiah } from '@/lib/utils';
import { PurchaseInvoiceStatus } from '@prisma/client';
import Link from 'next/link';
import { deleteInvoice } from '@/actions/invoices';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';

type InvoiceWithRelations = {
    id: string;
    invoiceNumber: string;
    invoiceDate: Date;
    dueDate: Date;
    status: PurchaseInvoiceStatus;
    totalAmount: number;
    paidAmount: number;
    purchaseOrderId: string;
    purchaseOrder: {
        id: string;
        orderNumber: string;
        supplier: {
            name: string;
        };
    };
};

interface PurchaseInvoiceTableProps {
    invoices: InvoiceWithRelations[];
    basePath?: string;
}

export function PurchaseInvoiceTable({ invoices, basePath = '/planning/purchase-orders' }: PurchaseInvoiceTableProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    const handleDelete = async (id: string) => {
        setIsDeleting(id);
        try {
            const result = await deleteInvoice(id, 'AP');
            if (result.success) {
                toast.success('Purchase invoice deleted successfully');
            } else {
                toast.error(result.error || 'Failed to delete invoice');
            }
        } catch (error) {
            console.error(error);
            toast.error('An unexpected error occurred');
        } finally {
            setIsDeleting(null);
        }
    };

    const filteredInvoices = useMemo(() => {
        return invoices.filter(inv =>
            inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.purchaseOrder.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.purchaseOrder.supplier.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [invoices, searchTerm]);

    const getStatusBadge = (status: PurchaseInvoiceStatus) => {
        const styles: Record<string, string> = {
            UNPAID: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900',
            PARTIAL: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900',
            PAID: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900',
            OVERDUE: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900',
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

            <div className="rounded-md border">
                <ResponsiveTable minWidth={800}>
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
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredInvoices.length > 0 ? (
                                filteredInvoices.map((inv) => (
                                    <TableRow key={inv.id} className="hover:bg-muted/30 transition-colors">
                                        <TableCell className="font-mono font-medium">
                                            <Link
                                                href={`${basePath}/${basePath.includes('finance') ? inv.id : inv.purchaseOrder.id}`}
                                                className="text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
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
                                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-medium">
                                            {formatRupiah(inv.paidAmount)}
                                        </TableCell>
                                        <TableCell>
                                            {getStatusBadge(inv.status)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="ghost" size="sm" asChild title="View Details">
                                                    <Link href={`${basePath}/${basePath.includes('finance') ? inv.id : inv.purchaseOrder.id}`}>
                                                        <ArrowRight className="h-4 w-4" />
                                                    </Link>
                                                </Button>

                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={isDeleting === inv.id} title="Delete/Void">
                                                            {isDeleting === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will permanently delete purchase invoice <strong>{inv.invoiceNumber}</strong> and its associated accounting journals from the ledger. This action cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                onClick={() => handleDelete(inv.id)}
                                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                            >
                                                                Delete Bill & Journals
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                                        No purchase invoices found.
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
