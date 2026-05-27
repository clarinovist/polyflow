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
import { formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import { ArrowRight, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { salesLabels, formLabels, getStatusLabel } from '@/lib/labels';
import { InvoiceStatus } from '@prisma/client';
import { deleteInvoice } from '@/actions/finance/invoices';
import { toast } from 'sonner';
import { useState } from 'react';
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

interface InvoiceTableProps {
    invoices: {
        id: string;
        invoiceNumber: string;
        invoiceDate: Date | string;
        dueDate?: Date | string | null;
        totalAmount: number;
        paidAmount: number;
        status: InvoiceStatus;
        salesOrderId?: string | null;
        purchaseOrderId?: string | null;
        salesOrder?: {
            orderNumber: string;
            customer: { name: string; } | null;
        } | null;
        purchaseOrder?: {
            orderNumber: string;
            supplier: { name: string; } | null;
        } | null;
    }[];
}

export function InvoiceTable({ invoices, basePath = '/sales/orders' }: InvoiceTableProps & { basePath?: string }) {
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    const handleDelete = async (id: string, type: 'AR' | 'AP') => {
        setIsDeleting(id);
        try {
            const result = await deleteInvoice(id, type);
            if (result.success) {
                toast.success('Invoice berhasil dihapus');
            } else {
                toast.error(result.error || 'Gagal menghapus invoice. Silakan coba lagi.');
            }
        } catch (error) {
            console.error(error);
            toast.error('Terjadi kesalahan yang tidak terduga. Silakan coba lagi.');
        } finally {
            setIsDeleting(null);
        }
    };

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
                {getStatusLabel(status, 'finance')}
            </Badge>
        );
    };

    return (
        <div className="rounded-md border">
            <ResponsiveTable minWidth={800}>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>No. {salesLabels.invoice}</TableHead>
                            <TableHead>{formLabels.date}</TableHead>
                            <TableHead>{salesLabels.dueDate}</TableHead>
                            <TableHead>Entitas</TableHead>
                            <TableHead>Order Referensi</TableHead>
                            <TableHead>{formLabels.status}</TableHead>
                            <TableHead className="text-right">{formLabels.total}</TableHead>
                            <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {invoices.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-24 text-center">
                                    {salesLabels.emptyInvoices}
                                </TableCell>
                            </TableRow>
                        ) : (
                            invoices.map((invoice) => {
                                const isAR = !!invoice.salesOrder;
                                const orderNumber = invoice.salesOrder?.orderNumber || invoice.purchaseOrder?.orderNumber || '-';
                                const entityName = invoice.salesOrder?.customer?.name || invoice.purchaseOrder?.supplier?.name || 'Legacy Internal Stock Build';

                                return (
                                    <TableRow key={invoice.id}>
                                        <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                                        <TableCell>{format(new Date(invoice.invoiceDate), 'PP')}</TableCell>
                                        <TableCell>
                                            <span className={invoice.status === ('OVERDUE' as InvoiceStatus) ? 'text-red-600 font-bold' : ''}>
                                                {invoice.dueDate ? format(new Date(invoice.dueDate), 'PP') : '-'}
                                            </span>
                                        </TableCell>
                                        <TableCell>{entityName}</TableCell>
                                        <TableCell>
                                            <Link href={`${basePath}/${basePath.includes('finance') ? invoice.id : (invoice.salesOrderId || invoice.purchaseOrderId || invoice.id)}`} className="text-blue-600 hover:underline">
                                                {orderNumber}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                                        <TableCell className="text-right font-medium">
                                            {formatRupiah(Number(invoice.totalAmount))}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="ghost" size="sm" asChild title="View Details">
                                                    <Link href={`${basePath}/${basePath.includes('finance') ? invoice.id : (invoice.salesOrderId || invoice.purchaseOrderId || invoice.id)}`}>
                                                        <ArrowRight className="h-4 w-4" />
                                                    </Link>
                                                </Button>

                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={isDeleting === invoice.id} title="Delete/Void">
                                                            {isDeleting === invoice.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Apakah Anda benar-benar yakin?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Tindakan ini akan menghapus invoice secara permanen <strong>{invoice.invoiceNumber}</strong> beserta jurnal akuntansinya dari buku besar. Tindakan ini tidak dapat dibatalkan.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Batal</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                onClick={() => handleDelete(invoice.id, isAR ? 'AR' : 'AP')}
                                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                            >
                                                                Hapus Invoice & Jurnal
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </ResponsiveTable>
        </div>
    );
}
