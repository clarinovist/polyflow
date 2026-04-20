import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatRupiah } from "@/lib/utils/utils";
import { PurchaseInvoiceStatus } from "@prisma/client";
import { format } from "date-fns";
import { AlertCircle, CreditCard, History } from "lucide-react";

interface FinancialPurchaseInvoiceDetailProps {
    invoice: {
        id: string;
        invoiceNumber: string;
        invoiceDate: Date | string;
        dueDate: Date | string;
        status: PurchaseInvoiceStatus;
        totalAmount: number;
        paidAmount: number;
        purchaseOrder: {
            orderNumber: string;
            supplier: { name: string };
            totalAmount: number;
        };
        payments?: {
            id: string;
            amount: number;
            paymentDate: Date | string;
            method?: string | null;
            notes?: string | null;
        }[];
    };
}

export function FinancialPurchaseInvoiceDetail({ invoice }: FinancialPurchaseInvoiceDetailProps) {
    const getStatusBadge = (status: PurchaseInvoiceStatus) => {
        const styles: Record<string, string> = {
            UNPAID: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
            PAID: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
            PARTIAL: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
            OVERDUE: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900',
        };
        return (
            <Badge variant="secondary" className={styles[status]}>
                {status}
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
                                <p className={invoice.status === 'OVERDUE' ? 'text-red-600 dark:text-red-400 font-bold' : 'font-medium'}>
                                    {format(new Date(invoice.dueDate), 'PP')}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Supplier</p>
                                <p className="font-medium">{invoice.purchaseOrder.supplier.name}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Reference PO</p>
                                <p className="font-medium text-blue-600 dark:text-blue-400">{invoice.purchaseOrder.orderNumber}</p>
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
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                {formatRupiah(Number(invoice.paidAmount))}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Remaining Balance</span>
                            <span className="font-medium text-red-600 dark:text-red-400">
                                {formatRupiah(Number(invoice.totalAmount) - Number(invoice.paidAmount))}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Read-Only Items View */}
            <Card>
                <CardHeader>
                    <CardTitle>Purchase Summary (Financial View)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border p-4 bg-muted/20">
                        <p className="text-sm text-muted-foreground mb-4">
                            Operational details (quantity, delivery status) are hidden in this view.
                        </p>
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm font-medium border-b pb-2">
                                <span>Description</span>
                                <span>Amount</span>
                            </div>
                            <div className="flex justify-between text-sm py-2">
                                <span>Purchase Order Total</span>
                                <span>{formatRupiah(Number(invoice.purchaseOrder.totalAmount))}</span>
                            </div>
                            <Separator className="my-2" />
                            <div className="flex justify-between font-bold">
                                <span>Invoice Total</span>
                                <span>{formatRupiah(Number(invoice.totalAmount))}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {invoice.payments && invoice.payments.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <History className="h-5 w-5" />
                            Payment History
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {invoice.payments.map((payment, index) => (
                                <div
                                    key={payment.id}
                                    className={`rounded-lg border p-4 ${index % 2 === 0 ? 'bg-muted/20' : 'bg-background'}`}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-1">
                                            <div className="text-sm font-medium">
                                                {format(new Date(payment.paymentDate), 'PP')}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <CreditCard className="h-3.5 w-3.5" />
                                                <span>{payment.method || 'Unknown method'}</span>
                                            </div>
                                            {payment.notes && (
                                                <p className="text-sm text-muted-foreground">{payment.notes}</p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                                                {formatRupiah(Number(payment.amount))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="flex items-center gap-2 p-4 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 rounded-lg text-sm">
                <AlertCircle className="h-4 w-4" />
                <p>
                    This is a read-only financial view. To manage receipts or edit items, switch to the Planning/Procurement module.
                </p>
            </div>
        </div>
    );
}
