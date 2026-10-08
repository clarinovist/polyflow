'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatRupiah } from '@/lib/utils/utils';
import {
    getEnteredQuantityDisplay,
    getEnteredUnitPriceDisplay,
} from '@/lib/utils/production-units';
import { InvoiceStatus, Invoice } from '@prisma/client';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import {
    ArrowLeft,
    CheckCircle,
    CreditCard,
    CalendarClock,
    CalendarDays,
} from 'lucide-react';
import { PrintPreviewModal } from '@/components/ui/print-preview-modal';
import { InvoiceDotMatrixPrint } from '@/components/finance/invoices/InvoiceDotMatrixPrint';
import { EntityStatusTimeline } from '@/components/shared/EntityStatusTimeline';
import { type CompanyConfig } from '@/lib/config/company';
import { toast } from 'sonner';
import { updateInvoiceStatus } from '@/actions/finance/invoice';
import { recordCustomerPayment } from '@/actions/finance/finance';
import { InvoicePriceAdjustment } from './InvoicePriceAdjustment';
import { EditSalesInvoiceDueDateDialog } from './EditSalesInvoiceDueDateDialog';
import { EditDraftSalesInvoiceDateDialog } from './EditDraftSalesInvoiceDateDialog';
import { FinancialInvoiceSummary } from './FinancialInvoiceSummary';
import { FinancialInvoicePrintActions } from './FinancialInvoicePrintActions';
import { FinancialInvoiceActivityTabs } from './FinancialInvoiceActivityTabs';
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

import { invoiceSnapshotOrder } from '@/lib/finance/invoice-snapshot';

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
    basePath?: string;
    canEditInvoiceDate?: boolean;
}

export function FinancialInvoiceDetail({
    invoice,
    companyConfig,
    paymentBanks = [],
    basePath = '/finance/invoices/sales',
    canEditInvoiceDate = false,
}: FinancialInvoiceDetailProps) {
    const router = useRouter();
    const [showPreview, setShowPreview] = React.useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState(() =>
        Math.max(0, Number(invoice.totalAmount) + Number(invoice.priceAdjustmentAmount ?? 0) - Number(invoice.paidAmount) - Number(invoice.creditedAmount ?? 0)),
    );
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
        DEFAULT_PAYMENT_METHOD,
    );
    const [referenceNumber, setReferenceNumber] = useState('');
    const [destinationBank, setDestinationBank] = useState<PaymentBankKey | ''>(
        '',
    );
    const [paymentDate, setPaymentDate] = useState(
        () => new Date().toISOString().split('T')[0],
    );
    const [isDueDateDialogOpen, setIsDueDateDialogOpen] = useState(false);
    const [isInvoiceDateDialogOpen, setIsInvoiceDateDialogOpen] =
        useState(false);
    const snapshotOrder = invoiceSnapshotOrder(invoice.commercialSnapshot);
    const legacyReferenceItems = snapshotOrder
        ? []
        : (invoice.salesOrder?.items ?? []);
    const salesOrder = invoice.salesOrder
        ? {
              ...invoice.salesOrder,
              ...(snapshotOrder ?? { items: [], taxAmount: 0 }),
          }
        : null;
    const taxAmount = Number(salesOrder?.taxAmount || 0);
    const remainingAmount =
        Number(invoice.totalAmount) + Number(invoice.priceAdjustmentAmount ?? 0) - Number(invoice.paidAmount) - Number(invoice.creditedAmount ?? 0);

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
                paymentDate: new Date(paymentDate),
                method: paymentMethod,
                notes: 'Recorded from financial invoice detail',
                referenceNumber:
                    paymentMethod === 'Check'
                        ? referenceNumber.trim()
                        : undefined,
                destinationBank:
                    paymentMethod === 'Check' ? destinationBank : undefined,
            });

            if (result.success) {
                toast.success(
                    `Pembayaran ${formatRupiah(paymentAmount)} berhasil dicatat.`,
                );
                setIsPaymentDialogOpen(false);
                setPaymentMethod(DEFAULT_PAYMENT_METHOD);
                setReferenceNumber('');
                setDestinationBank('');
                setPaymentDate(new Date().toISOString().split('T')[0]);
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
            DRAFT: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
            UNPAID: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
            PAID: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
            PARTIAL:
                'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
            PARTIALLY_PAID:
                'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
            OVERDUE:
                'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900',
            CANCELLED:
                'bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400',
        };
        const labels: Record<string, string> = {
            DRAFT: 'Draf',
            UNPAID: 'Belum Dibayar',
            PARTIAL: 'Sebagian Dibayar',
            PARTIALLY_PAID: 'Sebagian Dibayar',
            PAID: 'Lunas',
            OVERDUE: 'Lewat Jatuh Tempo',
            CANCELLED: 'Dibatalkan',
        };
        return (
            <Badge variant="secondary" className={styles[status]}>
                {labels[status] || status.replace(/_/g, ' ')}
            </Badge>
        );
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm lg:p-5 xl:sticky xl:top-4 xl:z-20 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 space-y-3">
                    <Button variant="outline" size="sm" asChild className="min-h-11">
                        <Link href={basePath}>
                            <ArrowLeft className="h-4 w-4" />
                            Kembali ke Daftar
                        </Link>
                    </Button>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
                                {invoice.invoiceNumber}
                            </h1>
                            {getStatusBadge(invoice.status)}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {salesOrder?.customer?.name || 'Customer tidak tersedia'}
                            {' · '}
                            Invoice {format(new Date(invoice.invoiceDate), 'd MMMM yyyy', { locale: id })}
                            {' · '}
                            Jatuh tempo{' '}
                            {invoice.dueDate
                                ? format(new Date(invoice.dueDate), 'd MMMM yyyy', { locale: id })
                                : 'belum ditentukan'}
                        </p>
                    </div>
                </div>

                <div
                    role="group"
                    aria-label="Aksi invoice"
                    className="flex flex-wrap items-center gap-2 xl:max-w-[58%] xl:justify-end [&_button]:min-h-11 [&_a]:min-h-11"
                >
                    {invoice.status === 'DRAFT' && (
                        <Button
                            onClick={handleConfirmInvoice}
                            disabled={isUpdating}
                            className="bg-sky-600 text-white hover:bg-sky-700"
                        >
                            <CheckCircle className="h-4 w-4" />
                            {isUpdating ? 'Memproses...' : 'Konfirmasi Invoice'}
                        </Button>
                    )}
                    {invoice.status !== 'PAID' &&
                        invoice.status !== 'CANCELLED' && (
                            <Button
                                variant={
                                    invoice.status === 'DRAFT'
                                        ? 'outline'
                                        : 'default'
                                }
                                onClick={() => {
                                    setPaymentAmount(
                                        Math.max(0, remainingAmount),
                                    );
                                    setIsPaymentDialogOpen(true);
                                }}
                            >
                                <CreditCard className="h-4 w-4" />
                                Catat Pembayaran
                            </Button>
                        )}
                    {!['DRAFT', 'CANCELLED'].includes(invoice.status) && (
                        <InvoicePriceAdjustment invoiceId={invoice.id} />
                    )}
                    {canEditInvoiceDate && invoice.status === 'DRAFT' && (
                        <Button
                            variant="outline"
                            onClick={() => setIsInvoiceDateDialogOpen(true)}
                        >
                            <CalendarDays className="h-4 w-4" />
                            Edit Tanggal Invoice
                        </Button>
                    )}
                    {invoice.status !== 'PAID' &&
                        invoice.status !== 'CANCELLED' && (
                            <Button
                                variant="outline"
                                onClick={() => setIsDueDateDialogOpen(true)}
                            >
                                <CalendarClock className="h-4 w-4" />
                                Edit Jatuh Tempo
                            </Button>
                        )}
                    <FinancialInvoicePrintActions
                        invoiceId={invoice.id}
                        onPreview={() => setShowPreview(true)}
                    />
                </div>
            </header>

            {/* Payment Dialog */}
            <Dialog
                open={isPaymentDialogOpen}
                onOpenChange={setIsPaymentDialogOpen}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Catat Pembayaran</DialogTitle>
                        <DialogDescription>
                            Masukkan jumlah pembayaran yang diterima untuk
                            invoice ini.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label
                                htmlFor="payment-amount"
                                className="text-right"
                            >
                                Jumlah
                            </Label>
                            <Input
                                id="payment-amount"
                                type="number"
                                value={paymentAmount}
                                onChange={(e) => {
                                    const normalized = e.target.value.replace(
                                        ',',
                                        '.',
                                    );
                                    const num = Number(normalized);
                                    setPaymentAmount(isNaN(num) ? 0 : num);
                                }}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label
                                htmlFor="payment-date"
                                className="text-right"
                            >
                                Tanggal Pembayaran
                            </Label>
                            <Input
                                id="payment-date"
                                type="date"
                                value={paymentDate}
                                onChange={(e) => setPaymentDate(e.target.value)}
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

            <FinancialInvoiceSummary
                totalAmount={Number(invoice.totalAmount)}
                paidAmount={Number(invoice.paidAmount)}
                creditedAmount={Number(invoice.creditedAmount ?? 0)}
                priceAdjustmentAmount={Number(
                    invoice.priceAdjustmentAmount ?? 0,
                )}
                remainingAmount={remainingAmount}
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(19rem,1fr)]">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Informasi Invoice
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                            {salesOrder?.orderType === 'MAKLON_JASA' && (
                                <Badge
                                    variant="outline"
                                    className="border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800/50 dark:bg-purple-950/30 dark:text-purple-300"
                                >
                                    Jasa Maklon
                                </Badge>
                            )}
                            {salesOrder?.entrySource ===
                                'EMERGENCY_DISPATCH' && (
                                <Badge
                                    variant="outline"
                                    className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/30 dark:bg-amber-950/20 dark:text-amber-400"
                                >
                                    Pesanan Dadakan
                                </Badge>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">
                                    Tanggal Invoice
                                </p>
                                <p className="font-medium">
                                    {format(
                                        new Date(invoice.invoiceDate),
                                        'd MMMM yyyy',
                                        { locale: id },
                                    )}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">
                                    Jatuh Tempo
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
                                              'd MMMM yyyy',
                                              { locale: id },
                                          )
                                        : '-'}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">
                                    Pelanggan
                                </p>
                                <p className="font-medium">
                                    {salesOrder?.customer?.name || 'N/A'}
                                </p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">
                                    Referensi Pesanan
                                </p>
                                {salesOrder?.orderNumber && invoice.salesOrderId ? (
                                    <Link
                                        href={`/sales/orders/${invoice.salesOrderId}`}
                                        className="font-medium text-blue-600 dark:text-blue-400 hover:underline rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                    >
                                        {salesOrder.orderNumber}
                                    </Link>
                                ) : (
                                    <p className="font-medium">
                                        {salesOrder?.orderNumber || 'N/A'}
                                    </p>
                                )}
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
                                Referensi Sales Order tidak tersedia. Total
                                finansial tetap mengikuti data invoice tersimpan.
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="lg:sticky lg:top-6 lg:self-start xl:top-40">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Rincian Saldo
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center py-1">
                            <span>Total Invoice</span>
                            <span className="font-bold text-lg">
                                {formatRupiah(Number(invoice.totalAmount))}
                            </span>
                        </div>
                        <Separator />
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">
                                Sudah Dibayar
                            </span>
                            <span className="font-medium text-emerald-600">
                                {formatRupiah(Number(invoice.paidAmount))}
                            </span>
                        </div>
                        {Number(invoice.priceAdjustmentAmount ?? 0) !== 0 && <div className="flex justify-between text-sm"><span>Penyesuaian harga</span><span>{formatRupiah(Number(invoice.priceAdjustmentAmount))}</span></div>}
                        {Number(invoice.creditedAmount ?? 0) > 0 && <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Kredit retur (bukan pembayaran)</span>
                            <span className="font-medium">{formatRupiah(Number(invoice.creditedAmount))}</span>
                        </div>}
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">
                                Sisa Tagihan
                            </span>
                            <span className="font-medium text-red-600">
                                {formatRupiah(remainingAmount)}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Read-Only Items View */}
            <Card>
                <CardHeader>
                    <CardTitle>Rincian Invoice</CardTitle>
                    {!snapshotOrder && (
                        <p role="note" className="text-sm text-muted-foreground">
                            Rincian harga historis invoice ini tidak tersedia.
                            Total di bawah tetap mengikuti invoice tersimpan,
                            bukan nilai SO saat ini.
                        </p>
                    )}
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border p-4 bg-muted/20">
                        <div className="space-y-2">
                            {snapshotOrder && (
                                <div className="flex justify-between text-sm font-medium border-b pb-2">
                                    <span>Deskripsi</span>
                                    <span>DPP (belum pajak)</span>
                                </div>
                            )}
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
                                                    {productVariant.name ||
                                                        productVariant.product
                                                            ?.name ||
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
                            ) : !legacyReferenceItems.length ? (
                                <div className="flex justify-between py-2 text-sm text-muted-foreground">
                                    <span>Rincian barang tidak tersedia</span>
                                    <span>—</span>
                                </div>
                            ) : null}
                            {snapshotOrder && (
                                <>
                                    <div className="flex justify-between text-sm py-2">
                                        <span>Ongkir</span>
                                        <span>
                                            {formatRupiah(
                                                snapshotOrder.shippingCost,
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm py-2">
                                        <span>Tax / VAT</span>
                                        <span>{formatRupiah(taxAmount)}</span>
                                    </div>
                                </>
                            )}
                            {Number(invoice.roundingAmount ?? 0) > 0 && (
                                <div className="flex justify-between text-sm py-2">
                                    <span>Pembulatan</span>
                                    <span>
                                        {formatRupiah(
                                            Number(invoice.roundingAmount),
                                        )}
                                    </span>
                                </div>
                            )}
                            <Separator className="my-2" />
                            <div className="flex justify-between font-bold">
                                <span>
                                    {snapshotOrder ? 'Total' : 'Total invoice tersimpan'}
                                </span>
                                <span>
                                    {formatRupiah(Number(invoice.totalAmount))}
                                </span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {legacyReferenceItems.length > 0 && (
                <Card role="region" aria-label="Referensi SO saat ini">
                    <CardHeader>
                        <CardTitle>Referensi SO saat ini</CardTitle>
                        <p className="text-sm font-medium">
                            {invoice.salesOrder?.orderNumber}
                        </p>
                        <p role="note" className="text-sm text-muted-foreground">
                            Nilai berikut berasal dari SO saat ini, bukan rincian
                            historis invoice. SO dapat berubah dan berbeda dari
                            tagihan. Nilai per barang sudah setelah diskon dan
                            termasuk pajak; bukan pengganti total invoice tersimpan.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border bg-muted/20 p-4">
                            <div className="flex justify-between gap-4 border-b pb-2 text-sm font-medium">
                                <span>Barang</span>
                                <span className="text-right">
                                    Nilai SO (termasuk pajak)
                                </span>
                            </div>
                            {legacyReferenceItems.map((item, index) => {
                                // Display the persisted SO subtotal only as a reference;
                                // never allocate it to the invoice or recompute its price.
                                const subtotal = item.subtotal == null
                                    ? null
                                    : Number(item.subtotal);
                                const hasSubtotal = subtotal !== null && Number.isFinite(subtotal);
                                return (
                                    <div
                                        key={item.id || index}
                                        className="flex justify-between gap-4 border-b py-2 text-sm last:border-0"
                                    >
                                        <span className="min-w-0 break-words font-medium">
                                            {item.productVariant?.name ||
                                                item.productVariant?.product?.name ||
                                                'Barang penjualan'}
                                        </span>
                                        <span
                                            className="shrink-0 text-right tabular-nums"
                                            aria-label={hasSubtotal ? undefined : 'Nilai SO tidak tersedia'}
                                        >
                                            {hasSubtotal ? formatRupiah(subtotal) : '—'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            <FinancialInvoiceActivityTabs
                audit={
                    <EntityStatusTimeline
                        entityType="Invoice"
                        entityId={invoice.id}
                    />
                }
            />

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
                        creditedAmount: Number(invoice.creditedAmount ?? 0),
                        priceAdjustmentAmount: Number(invoice.priceAdjustmentAmount ?? 0),
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

            {isInvoiceDateDialogOpen && (
                <EditDraftSalesInvoiceDateDialog
                    open={isInvoiceDateDialogOpen}
                    onOpenChange={setIsInvoiceDateDialogOpen}
                    invoice={{
                        id: invoice.id,
                        invoiceNumber: invoice.invoiceNumber,
                        invoiceDate: invoice.invoiceDate,
                        dueDate: invoice.dueDate,
                        termOfPaymentDays: invoice.termOfPaymentDays,
                    }}
                />
            )}

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
