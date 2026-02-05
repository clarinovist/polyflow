'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatRupiah, cn } from '@/lib/utils';
import { InvoiceStatus } from '@prisma/client';
import { Printer, CreditCard, ArrowLeft, CheckCircle } from 'lucide-react';
import { updateInvoiceStatus } from '@/actions/invoice';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

// Explicit type definition to avoid nested Prisma generic complexity
interface SerializedInvoice {
    id: string;
    invoiceNumber: string;
    invoiceDate: Date;
    dueDate: Date | null;
    status: InvoiceStatus;
    totalAmount: number;
    paidAmount: number;
    createdAt: Date;
    updatedAt: Date;
    salesOrder: {
        orderNumber: string;
        totalAmount: number | null;
        customer: {
            name: string;
            email: string | null;
            phone: string | null;
            billingAddress: string | null;
            shippingAddress: string | null;
            creditLimit: number | null;
            discountPercent: number | null;
        } | null;
        items: {
            id: string;
            quantity: number;
            unitPrice: number;
            subtotal: number;
            productVariant: {
                name: string;
                salesUnit: string | null;
                product: {
                    name: string;
                };
            };
        }[];
    };
}

interface InvoiceDetailClientProps {
    invoice: SerializedInvoice;
}

export function InvoiceDetailClient({ invoice }: InvoiceDetailClientProps) {
    const router = useRouter();
    const [isUpdating, setIsUpdating] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState<number>(Number(invoice.totalAmount) - Number(invoice.paidAmount));
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);

    const getStatusColor = (status: InvoiceStatus) => {
        switch (status) {
            case 'PAID': return 'bg-green-100 text-green-800 hover:bg-green-200';
            case 'PARTIAL': return 'bg-amber-100 text-amber-800 hover:bg-amber-200';
            case 'UNPAID': return 'bg-slate-100 text-slate-800 hover:bg-slate-200';
            case 'DRAFT': return 'bg-sky-50 text-sky-700 border-sky-100';
            case 'OVERDUE' as InvoiceStatus: return 'bg-red-100 text-red-800 hover:bg-red-200';
            case 'CANCELLED': return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const handlePayment = async () => {
        setIsUpdating(true);
        try {
            // Determine status based on payment amount
            const currentPaid = Number(invoice.paidAmount);
            const total = Number(invoice.totalAmount);
            const newPaid = currentPaid + paymentAmount;

            let newStatus: InvoiceStatus = invoice.status;

            if (newPaid >= total) {
                newStatus = 'PAID';
            } else {
                // Check if overdue
                const isOverdue = invoice.dueDate && new Date(invoice.dueDate) < new Date();
                if (isOverdue) {
                    newStatus = 'OVERDUE' as InvoiceStatus;
                } else if (newPaid > 0) {
                    newStatus = 'PARTIAL';
                }
            }

            const result = await updateInvoiceStatus({
                id: invoice.id,
                status: newStatus,
                paidAmount: newPaid // We pass the CUMULATIVE paid amount, or difference? 
                // Checking usage in invoice-service might be needed, but usually APIs take the new state or the delta.
                // Looking at action signature: updateInvoiceStatus(data: { id, status, paidAmount })
                // Assuming it takes the NEW TOTAL paid amount based on standard CRUD patterns.
            });

            if (result.success) {
                toast.success('Payment recorded successfully');
                setIsPaymentDialogOpen(false);
                router.refresh();
            } else {
                toast.error(result.error || 'Failed to update invoice');
            }
        } catch (_error) {
            toast.error('An unexpected error occurred');
        } finally {
            setIsUpdating(false);
        }
    };

    const remainingAmount = Number(invoice.totalAmount) - Number(invoice.paidAmount);

    return (
        <div className="space-y-6">
            {/* Header / Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">{invoice.invoiceNumber}</h1>
                        <p className="text-muted-foreground">
                            Created on {format(new Date(invoice.createdAt), 'PPP')}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {invoice.status === 'DRAFT' && (
                        <Button
                            className="bg-sky-600 hover:bg-sky-700 text-white"
                            onClick={async () => {
                                setIsUpdating(true);
                                try {
                                    const result = await updateInvoiceStatus({
                                        id: invoice.id,
                                        status: 'UNPAID'
                                    });
                                    if (result.success) {
                                        toast.success('Invoice confirmed successfully');
                                        router.refresh();
                                    } else {
                                        toast.error(result.error || 'Failed to confirm invoice');
                                    }
                                } catch (_error) {
                                    toast.error('An unexpected error occurred');
                                } finally {
                                    setIsUpdating(false);
                                }
                            }}
                            disabled={isUpdating}
                        >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Confirm Invoice
                        </Button>
                    )}

                    <Button variant="outline" onClick={() => window.print()}>
                        <Printer className="mr-2 h-4 w-4" />
                        Print
                    </Button>

                    {invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && (
                        <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                            <DialogTrigger asChild>
                                <Button>
                                    <CreditCard className="mr-2 h-4 w-4" />
                                    Record Payment
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Record Payment</DialogTitle>
                                    <DialogDescription>
                                        Enter the payment amount received for this invoice.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="amount" className="text-right">
                                            Amount
                                        </Label>
                                        <Input
                                            id="amount"
                                            type="number"
                                            value={paymentAmount}
                                            onChange={(e) => setPaymentAmount(Number(e.target.value))}
                                            className="col-span-3"
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label className="text-right">Remaining</Label>
                                        <div className="col-span-3 font-medium">
                                            {formatRupiah(remainingAmount)}
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>Cancel</Button>
                                    <Button onClick={handlePayment} disabled={isUpdating || paymentAmount <= 0}>
                                        {isUpdating ? 'Saving...' : 'Confirm Payment'}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Content: Invoice Details & Items */}
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Invoice Items</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Unit Price</TableHead>
                                        <TableHead className="text-right">Subtotal</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoice.salesOrder.items.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="font-medium">{item.productVariant.product.name}</div>
                                                <div className="text-sm text-muted-foreground">{item.productVariant.name}</div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {Number(item.quantity)} {item.productVariant.salesUnit}
                                            </TableCell>
                                            <TableCell className="text-right">{formatRupiah(Number(item.unitPrice))}</TableCell>
                                            <TableCell className="text-right">{formatRupiah(Number(item.subtotal))}</TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                                        <TableCell className="text-right font-bold text-lg">
                                            {formatRupiah(Number(invoice.totalAmount))}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-right font-medium text-muted-foreground">Paid Amount</TableCell>
                                        <TableCell className="text-right font-medium">
                                            {formatRupiah(Number(invoice.paidAmount))}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-right font-bold text-red-600">Balance Due</TableCell>
                                        <TableCell className="text-right font-bold text-red-600">
                                            {formatRupiah(Number(invoice.totalAmount) - Number(invoice.paidAmount))}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar: Status & Customer Info */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Status</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium">Payment Status</span>
                                    <Badge className={cn("capitalize", getStatusColor(invoice.status))}>
                                        {invoice.status.replace('_', ' ')}
                                    </Badge>
                                </div>
                                <Separator />
                                <div className="grid gap-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Invoice Date</span>
                                        <span>{format(new Date(invoice.invoiceDate), 'MMM dd, yyyy')}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Due Date</span>
                                        <span>{invoice.dueDate ? format(new Date(invoice.dueDate), 'MMM dd, yyyy') : '-'}</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Customer Information</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div>
                                    <div className="text-sm font-medium text-muted-foreground">Customer</div>
                                    <div className="text-lg font-semibold">{invoice.salesOrder.customer?.name || 'Internal / MTS'}</div>
                                    <div className="text-sm font-medium text-muted-foreground mt-2">Sales Order</div>
                                    <div className="font-medium underline decoration-dotted">
                                        {invoice.salesOrder.orderNumber}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-sm text-muted-foreground mb-1">Customer</h3>
                                    <p className="font-medium">{invoice.salesOrder.customer?.name || 'Internal / MTS'}</p>
                                    <p className="text-sm text-muted-foreground">{invoice.salesOrder.customer?.email || ''}</p>
                                    <p className="text-sm text-muted-foreground">{invoice.salesOrder.customer?.phone || ''}</p>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-sm text-muted-foreground mb-1">Billing Address</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {invoice.salesOrder.customer?.billingAddress || 'N/A'}
                                    </p>
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-muted-foreground">Shipping Address</div>
                                    <div className="text-sm whitespace-pre-wrap">{invoice.salesOrder.customer?.shippingAddress || 'N/A'}</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
