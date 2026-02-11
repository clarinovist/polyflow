'use client';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils';
import { format } from 'date-fns';
import { CheckCircle2, CreditCard, Trash2, Loader2 } from 'lucide-react';
import { deletePayment } from '@/actions/finance';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
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
import { Button } from '@/components/ui/button';

interface Payment {
    id: string;
    referenceNumber: string;
    date: Date | string;
    entityName: string;
    amount: number;
    method: string;
    status: string;
}

interface ComponentProps {
    title: string;
    description: string;
    payments: Payment[];
    type: 'received' | 'sent';
}

export function SharedPaymentTable({ title, description, payments, type }: ComponentProps) {
    const isReceived = type === 'received';
    const amountColor = isReceived ? 'text-emerald-600' : 'text-red-600';
    const amountPrefix = isReceived ? '+' : '-';
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    const handleDelete = async (id: string) => {
        setIsDeleting(id);
        try {
            const result = await deletePayment(id);
            if (result.success) {
                toast.success('Payment deleted and journals cleaned up');
                router.refresh();
            } else {
                toast.error(result.error || 'Failed to delete payment');
            }
        } catch (_error) {
            toast.error('An unexpected error occurred');
        } finally {
            setIsDeleting(null);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    {title}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Reference</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>{isReceived ? 'Received From' : 'Paid To'}</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                            <TableHead className="text-right w-10">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {payments.length > 0 ? (
                            payments.map((payment) => (
                                <TableRow key={payment.id} className="hover:bg-muted/50 group">
                                    <TableCell className="font-mono text-xs">{payment.referenceNumber}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {format(new Date(payment.date), 'dd MMM yyyy')}
                                    </TableCell>
                                    <TableCell className="font-medium">{payment.entityName}</TableCell>
                                    <TableCell>{payment.method}</TableCell>
                                    <TableCell className={`text-right font-bold ${amountColor}`}>
                                        {amountPrefix} {formatRupiah(payment.amount)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            {payment.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right whitespace-nowrap">
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    disabled={isDeleting === payment.id}
                                                >
                                                    {isDeleting === payment.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete Payment Record?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will delete the payment and its associated General Ledger journal entries.
                                                        The invoice status will be recalculated. This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => handleDelete(payment.id)}
                                                        className="bg-red-600 hover:bg-red-700"
                                                    >
                                                        Delete
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                    No payment records found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </ Card>
    );
}
