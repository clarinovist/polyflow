import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatRupiah } from "@/lib/utils";
import { InvoiceStatus, Invoice } from "@prisma/client";
import { format } from "date-fns";
import { AlertCircle } from "lucide-react";

interface FinancialInvoiceDetailProps {
    invoice: Invoice & {
        salesOrder: {
            orderNumber: string;
            customer: { name: string } | null;
            taxAmount: number | null;
            items: unknown[];
        };
    };
}

export function FinancialInvoiceDetail({ invoice }: FinancialInvoiceDetailProps) {
    const getStatusBadge = (status: InvoiceStatus) => {
        const styles: Record<string, string> = {
            UNPAID: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
            PAID: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
            PARTIALLY_PAID: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
            OVERDUE: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900',
            CANCELLED: 'bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400',
        };
        return (
            <Badge variant="secondary" className={styles[status]}>
                {status.replace(/_/g, ' ')}
            </Badge>
        );
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Invoice Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-2xl font-bold">{invoice.invoiceNumber}</span>
                            {getStatusBadge(invoice.status)}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">Invoice Date</p>
                                <p className="font-medium">{format(new Date(invoice.invoiceDate), 'PP')}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Due Date</p>
                                <p className={invoice.status === 'OVERDUE' ? 'text-red-600 font-bold' : 'font-medium'}>
                                    {invoice.dueDate ? format(new Date(invoice.dueDate), 'PP') : '-'}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Customer</p>
                                <p className="font-medium">{invoice.salesOrder.customer?.name || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Reference Order</p>
                                <p className="font-medium text-blue-600">{invoice.salesOrder.orderNumber}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Payment Summary
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center py-1">
                            <span>Total Amount</span>
                            <span className="font-bold text-lg">{formatRupiah(Number(invoice.totalAmount))}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Paid Amount</span>
                            <span className="font-medium text-emerald-600">
                                {formatRupiah(Number(invoice.paidAmount))}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Remaining Balance</span>
                            <span className="font-medium text-red-600">
                                {formatRupiah(Number(invoice.totalAmount) - Number(invoice.paidAmount))}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Read-Only Items View */}
            <Card>
                <CardHeader>
                    <CardTitle>Line Items (Financial View)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border p-4 bg-muted/20">
                        <p className="text-sm text-muted-foreground mb-4">
                            Operational details (quantity, delivery status) are hidden in this view.
                        </p>
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm font-medium border-b pb-2">
                                <span>Description</span>
                                <span>Subtotal</span>
                            </div>
                            <div className="flex justify-between text-sm py-2">
                                <span>Sales Order Items Total</span>
                                <span>{formatRupiah(Number(invoice.totalAmount) - Number(invoice.salesOrder.taxAmount || 0))}</span>
                            </div>
                            <div className="flex justify-between text-sm py-2">
                                <span>Tax / VAT</span>
                                <span>{formatRupiah(Number(invoice.salesOrder.taxAmount || 0))}</span>
                            </div>
                            <Separator className="my-2" />
                            <div className="flex justify-between font-bold">
                                <span>Total</span>
                                <span>{formatRupiah(Number(invoice.totalAmount))}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex items-center gap-2 p-4 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 rounded-lg text-sm">
                <AlertCircle className="h-4 w-4" />
                <p>
                    This is a read-only financial view. To manage delivery or edit items, switch to the Sales module.
                </p>
            </div>
        </div>
    );
}
