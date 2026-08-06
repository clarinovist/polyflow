'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatRupiah } from '@/lib/utils/utils';
import {
    getEnteredQuantityDisplay,
    getEnteredUnitPriceDisplay,
} from '@/lib/utils/production-units';
import { InvoiceStatus, Invoice } from '@prisma/client';
import { format } from 'date-fns';
import {
    AlertCircle,
    Printer,
    CheckCircle,
    CreditCard,
    CalendarClock,
} from 'lucide-react';
import { PrintPreviewModal } from '@/components/ui/print-preview-modal';
import { InvoiceDotMatrixPrint } from '@/components/finance/invoices/InvoiceDotMatrixPrint';
import { EntityStatusTimeline } from '@/components/shared/EntityStatusTimeline';
import { type CompanyConfig } from '@/lib/config/company';
import { toast } from 'sonner';
import { updateInvoiceStatus } from '@/actions/finance/invoice';
import { recordCustomerPayment } from '@/actions/finance/finance';
import { EditSalesInvoiceDueDateDialog } from './EditSalesInvoiceDueDateDialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PaymentMethodFields } from '@/components/finance/payments/PaymentMethodFields';
import {
    DEFAULT_PAYMENT_METHOD,
    type PaymentBankKey,
    type PaymentMethod,
    type TenantPaymentBanks,
} from '@/lib/finance/payment-methods';

type InvoiceLineItem = {
    id?: string;
    quantity?: unknown;
    unitPrice?: unknown;
    subtotal?: unknown;
    taxAmount?: unknown;
    enteredQuantity?: unknown;
    enteredUnit?: string | null;
    enteredUnitPrice?: unknown;
    conversionFactorSnapshot?: unknown;
    productVariant?: {
        name?: string;
        primaryUnit?: string | null;
        salesUnit?: string | null;
        conversionFactor?: unknown;
        product?: { name?: string };
    };
};

interface FinancialInvoiceDetailProps {
    invoice: Invoice & {
        salesOrder?: {
            orderNumber: string;
            orderType: string;
            customer: { name: string } | null;
            taxAmount: unknown;
            entrySource?: string;
            commercialReviewStatus?: string;
            sourceReference?: string | null;
            items: InvoiceLineItem[];
        } | null;
    };
    companyConfig?: CompanyConfig;
    paymentBanks?: TenantPaymentBanks;
}

export function FinancialInvoiceDetail({
    invoice,
    companyConfig,
    paymentBanks = {},
}: FinancialInvoiceDetailProps) {
    const router = useRouter();
    const [showPreview, setShowPreview] = React.useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState(() =>
        Math.max(
            0,
            Number(invoice.totalAmount) - Number(invoice.paidAmount),
        ),
    );
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
        DEFAULT_PAYMENT_METHOD,
    );
    const [referenceNumber, setReferenceNumber] = useState('');
    const [destinationBank, setDestinationBank] = useState<PaymentBankKey | ''>(
        '',
    );
    const [isDueDateDialogOpen, setIsDueDateDialogOpen] = useState(false);
    const salesOrder = invoice.salesOrder ?? null;
    const taxAmount = Number(salesOrder?.taxAmount || 0);
    const remainingAmount =
        Number(invoice.totalAmount) - Number(invoice.paidAmount);

    const handleConfirmInvoice = async () => {
        setIsUpdating(true);
        try {
            const result = await updateInvoiceStatus({
                id: invoice.id,
                status: 'UNPAID' as InvoiceStatus,
            });
            if (result.success) {
                toast.success(
                    `Invoice ${invoice.invoiceNumber} dikonfirmasi. Siap ditagih.`,
                );
                router.refresh();
            } else {
                toast.error(
                    result.error ||
                        'Gagal mengonfirmasi invoice. Silakan coba lagi.',
                );
            }
        } catch {
            toast.error('Gagal memproses invoice. Silakan coba lagi.');
        } finally {
            setIsUpdating(false);
        }
    };

    const handlePayment = async () => {
        if (paymentMethod === 'Check') {
            if (!referenceNumber.trim()) {
                toast.error('Nomor Cek / Giro wajib diisi.');
                return;
            }
            if (!destinationBank) {
                toast.error('Pilih bank tujuan clearing.');
                return;
            }
        }

        setIsUpdating(true);
        try {
            const result = await recordCustomerPayment({
                invoiceId: invoice.id,
                amount: paymentAmount,
                paymentDate: new Date(),
                method: paymentMethod,
                notes: 'Recorded from financial invoice detail',
                referenceNumber:
                    paymentMethod === 'Check'
                        ? referenceNumber.trim()
                        : undefined,
                destinationBank:
                    paymentMethod === 'Check'
                        ? destinationBank
                        : undefined,
            });

            if (result.success) {
                toast.success(
                    `Pembayaran ${formatRupiah(paymentAmount)} berhasil dicatat.`,
                );
                setIsPaymentDialogOpen(false);
                setPaymentMethod(DEFAULT_PAYMENT_METHOD);
                setReferenceNumber('');
                setDestinationBank('');
                router.refresh();
            } else {
                toast.error(
                    result.error ||
                        'Gagal mencatat pembayaran. Silakan coba lagi.',
                );
            }
        } catch {
            toast.error('Gagal memproses pembayaran. Silakan coba lagi.');
        } finally {
            setIsUpdating(false);
        }
    };

    const getStatusBadge = (status: InvoiceStatus) => {
        const styles: Record<string, string> = {
            UNPAID: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
            PAID: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
            PARTIALLY_PAID:
                'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
            OVERDUE:
                'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900',
            CANCELLED:
                'bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400',
        };
        return (
            <Badge variant="secondary" className={styles[status]}>
                {status.replace(/_/g, ' ')}
            </Badge>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-end flex-wrap gap-2">
                {invoice.status === 'DRAFT' && (
                    <button
                        onClick={handleConfirmInvoice}
                        disabled={isUpdating}
                        className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    >
                        <CheckCircle className="h-4 w-4" />
                        {isUpdating ? 'Memproses...' : 'Konfirmasi Invoice'}
                    </button>
                )}
                {invoice.status !== 'PAID' &&
                    invoice.status !== 'CANCELLED' && (
                        <>
                            <button
                                onClick={() => setIsPaymentDialogOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-medium transition-colors"
                            >
                                <CreditCard className="h-4 w-4" />
                                Catat Pembayaran
                            </button>
                            <button
                                onClick={() => setIsDueDateDialogOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-md text-sm font-medium transition-colors border"
                            >
                                <CalendarClock className="h-4 w-4" />
                                Edit Jatuh Tempo
                            </button>
                        </>
                    )}
                <button
                    onClick={() => setShowPreview(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-md text-sm font-medium transition-colors"
                >
                    <Printer className="h-4 w-4" />
                    Cetak Dot Matrix
                </button>
                <a
                    href={`/api/print/invoice?id=${invoice.id}`}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm font-medium transition-colors"
                >
                    <Printer className="h-4 w-4" />
                    ESC/P (Dot Matrix)
                </a>
            </div>

            {/* Payment Dialog */}
            <Dialog
                open={isPaymentDialogOpen}
                onOpenChange={setIsPaymentDialogOpen}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Catat Pembayaran</DialogTitle>
                        <DialogDescription>
                            Masukkan jumlah pembayaran yang diterima untuk invoice
                            ini.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="payment-amount" className="text-right">
                                Jumlah
                            </Label>
                            <Input
                                id="payment-amount"
                                type="number"
                                value={paymentAmount}
                                onChange={(e) => {
                                    const normalized = e.target.value.replace(',', '.');
                                    const num = Number(normalized);
                                    setPaymentAmount(isNaN(num) ? 0 : num);
                                }}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Sisa Tagihan</Label>
                            <div className="col-span-3 font-medium">
                                {formatRupiah(remainingAmount)}
                            </div>
                        </div>
                        <PaymentMethodFields
                            method={paymentMethod}
                            onMethodChange={setPaymentMethod}
                            referenceNumber={referenceNumber}
                            onReferenceNumberChange={setReferenceNumber}
                            destinationBank={destinationBank}
                            onDestinationBankChange={setDestinationBank}
                            paymentBanks={paymentBanks}
                            methodId="financial-invoice-method"
                        />
                    </div>
                    <DialogFooter>
                        <button
                            onClick={() => setIsPaymentDialogOpen(false)}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-md text-sm font-medium transition-colors"
                        >
                            Batal
                        </button>
                        <button
                            onClick={handlePayment}
                            disabled={isUpdating || paymentAmount <= 0}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                            {isUpdating
                                ? 'Menyimpan...'
                                : 'Konfirmasi Pembayaran'}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Invoice Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl font-bold">
                                    {invoice.invoiceNumber}
                                </span>
                                {salesOrder?.orderType === 'MAKLON_JASA' && (
                                    <Badge
                                        variant="outline"
                                        className="bg-purple-50 text-purple-700 border-purple-200"
                                    >
                                        Maklon Service
                                    </Badge>
                                )}
                                {salesOrder?.entrySource === 'EMERGENCY_DISPATCH' && (
                                    <Badge
                                        variant="outline"
                                        className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800/30"
                                    >
                                        Pesanan Dadakan
                                    </Badge>
                                )}
                            </div>
                            {getStatusBadge(invoice.status)}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">
                                    Invoice Date
                                </p>
                                <p className="font-medium">
                                    {format(
                                        new Date(invoice.invoiceDate),
                                        'PP',
                                    )}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">
                                    Due Date
                                </p>
                                <p
                                    className={
                                        invoice.status === 'OVERDUE'
                                            ? 'text-red-600 font-bold'
                                            : 'font-medium'
                                    }
                                >
                                    {invoice.dueDate
                                        ? format(
                                              new Date(invoice.dueDate),
                                              'PP',
                                          )
                                        : '-'}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">
                                    Customer
                                </p>
                                <p className="font-medium">
                                    {salesOrder?.customer?.name || 'N/A'}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">
                                    Reference Order
                                </p>
                                <p className="font-medium text-blue-600">
                                    {salesOrder?.orderNumber || 'N/A'}
                                </p>
                            </div>
                            {salesOrder?.sourceReference && (
                                <div>
                                    <p className="text-muted-foreground">
                                        Referensi (Telp/WA)
                                    </p>
                                    <p className="font-medium">
                                        {salesOrder.sourceReference}
                                    </p>
                                </div>
                            )}
                        </div>
                        {!salesOrder && (
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                Sales order reference is missing for this
                                invoice. Financial totals are still shown using
                                invoice data.
                            </div>
                        )}
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
                            <span className="font-bold text-lg">
                                {formatRupiah(Number(invoice.totalAmount))}
                            </span>
                        </div>
                        <Separator />
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">
                                Paid Amount
                            </span>
                            <span className="font-medium text-emerald-600">
                                {formatRupiah(Number(invoice.paidAmount))}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">
                                Remaining Balance
                            </span>
                            <span className="font-medium text-red-600">
                                {formatRupiah(
                                    Number(invoice.totalAmount) -
                                        Number(invoice.paidAmount),
                                )}
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
                            Operational details (quantity, delivery status) are
                            hidden in this view.
                        </p>
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm font-medium border-b pb-2">
                                <span>Description</span>
                                <span>DPP (excl. tax)</span>
                            </div>
                            {salesOrder?.items?.length ? (
                                salesOrder.items.map((item, index) => {
                                    const productVariant =
                                        item.productVariant || {};
                                    const price = getEnteredUnitPriceDisplay({
                                        ...item,
                                        ...productVariant,
                                    });
                                    // item.subtotal includes tax; DPP = subtotal - taxAmount
                                    const itemDpp =
                                        Number(item.subtotal || 0) -
                                        Number(item.taxAmount || 0);
                                    return (
                                        <div
                                            key={item.id || index}
                                            className="flex justify-between gap-4 text-sm py-2 border-b last:border-0"
                                        >
                                            <div>
                                                <div className="font-medium">
                                                    {productVariant.product
                                                        ?.name ||
                                                        productVariant.name ||
                                                        'Sales Item'}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {getEnteredQuantityDisplay({
                                                        ...item,
                                                        ...productVariant,
                                                    })}{' '}
                                                    ×{' '}
                                                    {formatRupiah(price.price)}/
                                                    {price.unit}
                                                </div>
                                            </div>
                                            <span>{formatRupiah(itemDpp)}</span>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="flex justify-between text-sm py-2">
                                    <span>Sales Order Items Total</span>
                                    <span>
                                        {formatRupiah(
                                            Number(invoice.totalAmount) -
                                                taxAmount,
                                        )}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between text-sm py-2">
                                <span>Tax / VAT</span>
                                <span>{formatRupiah(taxAmount)}</span>
                            </div>
                            <Separator className="my-2" />
                            <div className="flex justify-between font-bold">
                                <span>Total</span>
                                <span>
                                    {formatRupiah(Number(invoice.totalAmount))}
                                </span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <EntityStatusTimeline entityType="Invoice" entityId={invoice.id} />

            <div className="flex items-center gap-2 p-4 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 rounded-lg text-sm">
                <AlertCircle className="h-4 w-4" />
                <p>
                    Status invoice dan pembayaran sudah bisa dikelola dari halaman
                    ini. Untuk edit item atau mengelola pengiriman, switch ke Sales
                    module.
                </p>
            </div>

            <PrintPreviewModal
                open={showPreview}
                onOpenChange={setShowPreview}
                title={`Invoice ${invoice.invoiceNumber}`}
                landscape={true}
            >
                <InvoiceDotMatrixPrint
                    invoice={{
                        ...invoice,
                        totalAmount: Number(invoice.totalAmount),
                        paidAmount: Number(invoice.paidAmount),
                        salesOrder: invoice.salesOrder
                            ? {
                                  ...invoice.salesOrder,
                                  taxAmount:
                                      invoice.salesOrder.taxAmount != null
                                          ? Number(invoice.salesOrder.taxAmount)
                                          : 0,
                                  items: invoice.salesOrder.items?.map(
                                      (item) => ({
                                          ...item,
                                          quantity: Number(item.quantity),
                                          unitPrice: Number(item.unitPrice),
                                          subtotal: Number(item.subtotal),
                                          enteredQuantity:
                                              item.enteredQuantity != null
                                                  ? Number(item.enteredQuantity)
                                                  : undefined,
                                          enteredUnitPrice:
                                              item.enteredUnitPrice != null
                                                  ? Number(
                                                        item.enteredUnitPrice,
                                                    )
                                                  : undefined,
                                      }),
                                  ),
                              }
                            : undefined,
                    }}
                    showButton={false}
                    previewMode={true}
                    companyConfig={companyConfig}
                />
            </PrintPreviewModal>

            {isDueDateDialogOpen && (
                <EditSalesInvoiceDueDateDialog
                    open={isDueDateDialogOpen}
                    onOpenChange={setIsDueDateDialogOpen}
                    invoice={{
                        id: invoice.id,
                        invoiceNumber: invoice.invoiceNumber,
                        invoiceDate: invoice.invoiceDate,
                        dueDate: invoice.dueDate,
                        termOfPaymentDays:
                            (invoice as { termOfPaymentDays?: number | null })
                                .termOfPaymentDays ?? null,
                    }}
                />
            )}
        </div>
    );
}
