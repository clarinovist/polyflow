'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatRupiah } from '@/lib/utils';
import { format } from 'date-fns';
import { ArrowLeft, FileText, Calendar, Building2, CreditCard, CheckCircle, AlertCircle, History, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { recordPurchasePayment } from '@/actions/purchasing';

interface PurchaseInvoiceDetailProps {
    invoice: {
        id: string;
        invoiceNumber: string;
        invoiceDate: Date | string;
        dueDate: Date | string;
        status: string;
        totalAmount: number;
        paidAmount: number;
        purchaseOrder: {
            id: string;
            orderNumber: string;
            totalAmount: number;
            supplier: { name: string; code: string | null };
        };
        payments?: {
            id: string;
            amount: number;
            paymentDate: string;
            paymentMethod?: string | null;
            reference?: string | null;
            createdBy?: { name: string | null } | null;
        }[];
    };
}

export function PurchaseInvoiceDetailClient({ invoice }: PurchaseInvoiceDetailProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');

    const remainingAmount = invoice.totalAmount - invoice.paidAmount;
    const isOverdue = new Date(invoice.dueDate) < new Date() && invoice.status !== 'PAID';
    const progressPercent = invoice.totalAmount > 0 ? (invoice.paidAmount / invoice.totalAmount) * 100 : 0;

    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            UNPAID: 'bg-red-100 text-red-800 border-red-200',
            PARTIAL: 'bg-amber-100 text-amber-800 border-amber-200',
            PAID: 'bg-emerald-100 text-emerald-800 border-emerald-200',
            OVERDUE: 'bg-red-100 text-red-800 border-red-200',
        };
        return (
            <Badge variant="outline" className={styles[status] || styles.UNPAID}>
                {status}
            </Badge>
        );
    };

    const handlePayment = async () => {
        const amount = parseFloat(paymentAmount);
        if (isNaN(amount) || amount <= 0) {
            toast.error('Please enter a valid payment amount');
            return;
        }

        if (amount > remainingAmount) {
            toast.error(`Payment cannot exceed remaining amount (${formatRupiah(remainingAmount)})`);
            return;
        }

        setIsLoading(true);
        try {
            await recordPurchasePayment(invoice.id, amount);
            toast.success(`Payment of ${formatRupiah(amount)} recorded successfully`);
            setPaymentAmount('');
            router.refresh();
        } catch (_error) {
            toast.error('Failed to record payment');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePayFull = async () => {
        setIsLoading(true);
        try {
            await recordPurchasePayment(invoice.id, remainingAmount);
            toast.success(`Full payment of ${formatRupiah(remainingAmount)} recorded`);
            router.refresh();
        } catch (_error) {
            toast.error('Failed to record payment');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/dashboard/purchasing/invoices">
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <FileText className="h-6 w-6 text-blue-600" />
                            {invoice.invoiceNumber}
                            {getStatusBadge(invoice.status)}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            Invoice Date: {format(new Date(invoice.invoiceDate), 'PPP')}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    {/* Amount Summary Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Payment Summary</CardTitle>
                            <CardDescription>Track payments for this invoice</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Progress Bar */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Payment Progress</span>
                                    <span className="font-medium">{progressPercent.toFixed(0)}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                                    <div
                                        className={`h-3 rounded-full transition-all ${invoice.status === 'PAID' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                        style={{ width: `${progressPercent}%` }}
                                    />
                                </div>
                            </div>

                            {/* Amount Breakdown */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-4 bg-muted/50 rounded-lg text-center">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Amount</p>
                                    <p className="text-xl font-bold">{formatRupiah(invoice.totalAmount)}</p>
                                </div>
                                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg text-center">
                                    <p className="text-xs text-emerald-600 uppercase tracking-wider mb-1">Paid</p>
                                    <p className="text-xl font-bold text-emerald-600">{formatRupiah(invoice.paidAmount)}</p>
                                </div>
                                <div className={`p-4 rounded-lg text-center ${isOverdue ? 'bg-red-50 dark:bg-red-950/20' : 'bg-amber-50 dark:bg-amber-950/20'}`}>
                                    <p className={`text-xs uppercase tracking-wider mb-1 ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>Remaining</p>
                                    <p className={`text-xl font-bold ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>{formatRupiah(remainingAmount)}</p>
                                </div>
                            </div>

                            {/* Due Date Warning */}
                            {isOverdue && (
                                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
                                    <AlertCircle className="h-5 w-5 shrink-0" />
                                    <div className="text-sm">
                                        <span className="font-semibold">Overdue!</span> This invoice was due on {format(new Date(invoice.dueDate), 'PPP')}.
                                    </div>
                                </div>
                            )}

                            {/* Payment Form */}
                            {invoice.status !== 'PAID' && (
                                <div className="pt-4 border-t space-y-4">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <CreditCard className="h-4 w-4" />
                                        Record Payment
                                    </h3>
                                    <div className="flex gap-3">
                                        <div className="flex-1">
                                            <Input
                                                type="number"
                                                placeholder="Enter payment amount"
                                                value={paymentAmount}
                                                onChange={(e) => setPaymentAmount(e.target.value)}
                                                className="h-11"
                                            />
                                        </div>
                                        <Button
                                            onClick={handlePayment}
                                            disabled={isLoading || !paymentAmount}
                                            className="h-11"
                                        >
                                            Record Payment
                                        </Button>
                                    </div>
                                    <Button
                                        variant="outline"
                                        onClick={handlePayFull}
                                        disabled={isLoading}
                                        className="w-full text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                    >
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        Pay Full Amount ({formatRupiah(remainingAmount)})
                                    </Button>
                                </div>
                            )}

                            {invoice.status === 'PAID' && (
                                <div className="flex items-center justify-center gap-2 p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg">
                                    <CheckCircle className="h-6 w-6 text-emerald-600" />
                                    <span className="font-semibold text-emerald-600">Fully Paid</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Payment History */}
                    {invoice.payments && invoice.payments.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <History className="h-5 w-5" />
                                    Payment History
                                </CardTitle>
                                <CardDescription>
                                    {invoice.payments.length} payment(s) recorded
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {invoice.payments.map((payment, idx) => (
                                        <div
                                            key={payment.id}
                                            className={`flex items-center justify-between p-3 rounded-lg ${idx % 2 === 0 ? 'bg-muted/30' : 'bg-muted/10'}`}
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium">
                                                    {format(new Date(payment.paymentDate), 'PPP')}
                                                </span>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <User className="h-3 w-3" />
                                                    {payment.createdBy?.name || 'Unknown'}
                                                    {payment.reference && (
                                                        <span className="font-mono">• Ref: {payment.reference}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-lg font-bold text-emerald-600">
                                                {formatRupiah(payment.amount)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="space-y-6">
                    {/* Invoice Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Invoice Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-start gap-3">
                                <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div>
                                    <h3 className="text-xs font-medium text-muted-foreground">Purchase Order</h3>
                                    <Link
                                        href={`/dashboard/purchasing/orders/${invoice.purchaseOrder.id}`}
                                        className="font-mono text-blue-600 hover:underline"
                                    >
                                        {invoice.purchaseOrder.orderNumber}
                                    </Link>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div>
                                    <h3 className="text-xs font-medium text-muted-foreground">Supplier</h3>
                                    <p className="font-medium">{invoice.purchaseOrder.supplier.name}</p>
                                    {invoice.purchaseOrder.supplier.code && (
                                        <p className="text-xs text-muted-foreground font-mono">
                                            {invoice.purchaseOrder.supplier.code}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div>
                                    <h3 className="text-xs font-medium text-muted-foreground">Invoice Date</h3>
                                    <p className="font-medium">{format(new Date(invoice.invoiceDate), 'PPP')}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <Calendar className={`h-4 w-4 mt-0.5 ${isOverdue ? 'text-red-500' : 'text-muted-foreground'}`} />
                                <div>
                                    <h3 className={`text-xs font-medium ${isOverdue ? 'text-red-500' : 'text-muted-foreground'}`}>Due Date</h3>
                                    <p className={`font-medium ${isOverdue ? 'text-red-600' : ''}`}>
                                        {format(new Date(invoice.dueDate), 'PPP')}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
