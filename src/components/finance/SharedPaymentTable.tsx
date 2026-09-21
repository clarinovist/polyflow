'use client';

import { useMemo, useCallback, useState, useRef } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import {
    CheckCircle2,
    CreditCard,
    Trash2,
    Loader2,
    Search,
    Eye,
} from 'lucide-react';
import { deletePayment } from '@/actions/finance/finance';
import {
    getBarterSettlementDetail,
    voidBarterSettlement,
} from '@/actions/finance/barter-actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

import { getPaymentMethodLabel } from '@/lib/finance/payment-methods';

interface Payment {
    id: string;
    referenceNumber: string;
    paymentNumber?: string;
    settlementId?: string | null;
    barterLeg?: 'AR_OFFSET' | 'AP_OFFSET' | 'AP_CASH' | null;
    date: Date | string;
    entityName: string;
    amount: number;
    method: string;
    instrumentNumber?: string | null;
    destinationBank?: string | null;
    status: string;
}

interface BarterDetail {
    settlementNumber: string;
    barterDate: Date | string;
    status: string;
    customer: { name: string };
    supplier: { name: string };
    invoice: { invoiceNumber: string };
    purchaseInvoice: { invoiceNumber: string };
    barterAmount: number;
    cashAmount: number;
    receivableBefore: number;
    payableBefore: number;
    receivableAfter: number;
    payableAfter: number;
    cashMethod?: string | null;
    cashReferenceNumber?: string | null;
    offsetJournalNumber?: string | null;
    cashJournalNumber?: string | null;
    notes: string;
    createdBy: { name: string | null };
    voidedBy?: { name: string | null } | null;
    voidReason?: string | null;
}

interface ComponentProps {
    title: string;
    description: string;
    payments: Payment[];
    type: 'received' | 'sent';
}

export function SharedPaymentTable({
    title,
    description,
    payments,
    type,
}: ComponentProps) {
    const isReceived = type === 'received';
    const amountColor = isReceived
        ? 'text-emerald-700 dark:text-emerald-400'
        : 'text-red-700 dark:text-red-400';
    const amountPrefix = isReceived ? '+' : '-';
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [voidReasons, setVoidReasons] = useState<Record<string, string>>({});
    const [confirmPayment, setConfirmPayment] = useState<Payment | null>(null);
    const [detail, setDetail] = useState<BarterDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState<string | null>(null);
    const detailRequest = useRef(0);
    const mutationPending = useRef(false);

    const filteredPayments = useMemo(() => {
        return payments.filter((p) => {
            const lowerSearch = searchTerm.toLowerCase();
            return (
                p.referenceNumber.toLowerCase().includes(lowerSearch) ||
                p.entityName.toLowerCase().includes(lowerSearch) ||
                p.method.toLowerCase().includes(lowerSearch)
            );
        });
    }, [payments, searchTerm]);

    const handleDelete = useCallback(
        async (payment: Payment) => {
            if (mutationPending.current) return;
            mutationPending.current = true;
            const voidReason = voidReasons[payment.id] ?? '';
            setIsDeleting(payment.id);
            try {
                if (payment.settlementId && voidReason.trim().length < 5) {
                    toast.error('Alasan pembatalan minimal 5 karakter.');
                    return;
                }
                const result = payment.settlementId
                    ? await voidBarterSettlement({
                          settlementId: payment.settlementId,
                          reason: voidReason.trim(),
                      })
                    : await deletePayment(payment.id);
                if (result.success) {
                    toast.success(
                        payment.settlementId
                            ? 'Paket barter berhasil dibatalkan.'
                            : 'Pembayaran berhasil dihapus dan jurnal dibersihkan.',
                    );
                    setVoidReasons((previous) => ({
                        ...previous,
                        [payment.id]: '',
                    }));
                    router.refresh();
                } else {
                    toast.error(result.error || 'Gagal menghapus pembayaran');
                }
            } catch (_error) {
                toast.error('Gagal memproses. Silakan coba lagi.');
            } finally {
                mutationPending.current = false;
                setIsDeleting(null);
            }
        },
        [router, voidReasons],
    );

    const handleOpenDetail = useCallback(async (payment: Payment) => {
        const request = ++detailRequest.current;
        setDetail(null);
        setDetailLoading(payment.id);
        try {
            const result = await getBarterSettlementDetail(
                payment.settlementId!,
            );
            if (request !== detailRequest.current) return;
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            setDetail(result.data as BarterDetail);
        } catch {
            if (request === detailRequest.current)
                toast.error('Gagal memuat detail barter.');
        } finally {
            if (request === detailRequest.current) setDetailLoading(null);
        }
    }, []);

    const renderActions = useCallback(
        (payment: Payment) => (
            <div className="flex justify-end gap-1 whitespace-nowrap">
                {payment.settlementId && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 md:h-8 md:w-8"
                        aria-label={`Detail ${payment.paymentNumber ?? payment.referenceNumber}`}
                        disabled={detailLoading === payment.id}
                        onClick={() => handleOpenDetail(payment)}
                    >
                        {detailLoading === payment.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Eye className="h-4 w-4" />
                        )}
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 md:h-9 md:w-9"
                    aria-label={`${payment.settlementId ? 'Batalkan' : 'Hapus'} ${payment.paymentNumber ?? payment.referenceNumber}`}
                    disabled={
                        isDeleting !== null || payment.status === 'VOIDED'
                    }
                    onClick={() => {
                        setVoidReasons((previous) => ({
                            ...previous,
                            [payment.id]: '',
                        }));
                        setConfirmPayment(payment);
                    }}
                >
                    {isDeleting === payment.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Trash2 className="h-4 w-4" />
                    )}
                </Button>
            </div>
        ),
        [detailLoading, handleOpenDetail, isDeleting],
    );

    const columns: ColumnDef<Payment, unknown>[] = useMemo(
        () => [
            {
                id: 'referenceNumber',
                header: 'Reference',
                size: 160,
                accessorFn: (row) => row.referenceNumber,
                sortingFn: (a, b) =>
                    new Date(a.original.date).getTime() -
                    new Date(b.original.date).getTime(),
                cell: ({ row }) => (
                    <div>
                        <span className="font-mono text-xs font-medium">
                            {row.original.referenceNumber}
                        </span>
                        {row.original.paymentNumber &&
                            row.original.paymentNumber !==
                                row.original.referenceNumber && (
                                <div className="font-mono text-[10px] text-muted-foreground">
                                    {row.original.paymentNumber}
                                </div>
                            )}
                        <div className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(row.original.date), 'dd MMM yyyy')}
                        </div>
                    </div>
                ),
            },
            {
                id: 'entityName',
                header: isReceived ? 'Received From' : 'Paid To',
                size: 200,
                accessorFn: (row) => row.entityName,
                cell: ({ row }) => (
                    <div
                        className="min-w-0 font-medium truncate"
                        title={row.original.entityName}
                    >
                        {row.original.entityName}
                    </div>
                ),
            },
            {
                id: 'amount',
                header: () => <div className="text-right">Amount</div>,
                size: 180,
                accessorFn: (row) => row.amount,
                cell: ({ row }) => {
                    const p = row.original;
                    const label =
                        p.barterLeg === 'AR_OFFSET' ||
                        p.barterLeg === 'AP_OFFSET'
                            ? 'Pelunasan nonkas — Barter'
                            : p.barterLeg === 'AP_CASH'
                              ? `Uang keluar — ${getPaymentMethodLabel(p.method)}`
                              : getPaymentMethodLabel(p.method);
                    const details: string[] = [];
                    if (p.instrumentNumber)
                        details.push(`No: ${p.instrumentNumber}`);
                    if (p.destinationBank) details.push(p.destinationBank);
                    return (
                        <div className="text-right">
                            <div
                                className={`font-bold tabular-nums ${
                                    p.barterLeg === 'AR_OFFSET' ||
                                    p.barterLeg === 'AP_OFFSET'
                                        ? 'text-blue-700 dark:text-blue-400'
                                        : amountColor
                                }`}
                            >
                                {p.barterLeg === 'AR_OFFSET' ||
                                p.barterLeg === 'AP_OFFSET'
                                    ? ''
                                    : amountPrefix}{' '}
                                {formatRupiah(p.amount)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                                {label}
                                {details.length > 0 &&
                                    ` · ${details.join(' · ')}`}
                            </div>
                        </div>
                    );
                },
            },
            {
                accessorKey: 'status',
                header: () => <div className="text-right">Status</div>,
                size: 110,
                cell: ({ row }) => (
                    <div className="text-right">
                        <Badge
                            variant="outline"
                            className={cn(
                                'text-[11px]',
                                row.original.status === 'VOIDED'
                                    ? 'border-red-200 bg-red-50 text-red-700'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                            )}
                        >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {row.original.status || 'Lunas'}
                        </Badge>
                    </div>
                ),
            },
            {
                id: 'actions',
                header: () => <div className="text-right">Actions</div>,
                size: 60,
                enableSorting: false,
                cell: ({ row }) => renderActions(row.original),
            },
        ],
        [isReceived, amountColor, amountPrefix, renderActions],
    );

    return (
        <Card className="min-w-0 gap-4 py-4">
            <CardHeader className="px-4 md:px-6">
                <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    {title}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 px-4 md:px-6">
                {payments.length >= 200 && (
                    <p className="mb-3 text-sm text-amber-700">
                        Menampilkan maksimal 200 pembayaran terbaru. Persempit
                        rentang tanggal untuk histori lainnya; pencarian hanya
                        mencakup data yang dimuat.
                    </p>
                )}
                <DataTable
                    columns={columns}
                    data={filteredPayments}
                    emptyMessage="Tidak ada catatan pembayaran."
                    minWidth={750}
                    renderMobileView={(data) =>
                        data.length === 0 ? (
                            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                                Tidak ada catatan pembayaran.
                            </p>
                        ) : (
                            data.map((payment) => {
                                const noncash =
                                    payment.barterLeg === 'AR_OFFSET' ||
                                    payment.barterLeg === 'AP_OFFSET';
                                return (
                                    <article
                                        key={payment.id}
                                        aria-label={`Pembayaran ${payment.paymentNumber ?? payment.referenceNumber}`}
                                        className="space-y-2 rounded-lg border p-3 text-sm [overflow-wrap:anywhere]"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <h3 className="font-mono font-semibold">
                                                    {payment.referenceNumber}
                                                </h3>
                                                {payment.paymentNumber &&
                                                    payment.paymentNumber !==
                                                        payment.referenceNumber && (
                                                        <p className="font-mono text-xs text-muted-foreground">
                                                            {
                                                                payment.paymentNumber
                                                            }
                                                        </p>
                                                    )}
                                                <p className="text-xs text-muted-foreground">
                                                    {format(
                                                        new Date(payment.date),
                                                        'dd MMM yyyy',
                                                    )}
                                                </p>
                                            </div>
                                            <Badge
                                                variant="outline"
                                                className={
                                                    payment.status === 'VOIDED'
                                                        ? 'text-red-700 dark:text-red-400'
                                                        : 'text-emerald-700 dark:text-emerald-400'
                                                }
                                            >
                                                {payment.status || 'Lunas'}
                                            </Badge>
                                        </div>
                                        <p className="font-medium">
                                            <span className="sr-only">
                                                {isReceived
                                                    ? 'Received From: '
                                                    : 'Paid To: '}
                                            </span>
                                            {payment.entityName}
                                        </p>
                                        <div className="border-t pt-2 text-right">
                                            <p
                                                className={cn(
                                                    'font-bold tabular-nums',
                                                    noncash
                                                        ? 'text-blue-700 dark:text-blue-400'
                                                        : amountColor,
                                                )}
                                            >
                                                {noncash ? '' : amountPrefix}{' '}
                                                {formatRupiah(payment.amount)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {noncash
                                                    ? 'Pelunasan nonkas — Barter'
                                                    : payment.barterLeg ===
                                                        'AP_CASH'
                                                      ? `Uang keluar — ${getPaymentMethodLabel(payment.method)}`
                                                      : getPaymentMethodLabel(
                                                            payment.method,
                                                        )}
                                            </p>
                                            {payment.instrumentNumber && (
                                                <p className="text-xs text-muted-foreground">
                                                    No:{' '}
                                                    {payment.instrumentNumber}
                                                </p>
                                            )}
                                            {payment.destinationBank && (
                                                <p className="text-xs text-muted-foreground">
                                                    {payment.destinationBank}
                                                </p>
                                            )}
                                        </div>
                                        {renderActions(payment)}
                                    </article>
                                );
                            })
                        )
                    }
                >
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-3.5 md:top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            aria-label="Cari dalam transaksi yang dimuat"
                            placeholder={
                                isReceived
                                    ? 'Cari referensi atau pelanggan...'
                                    : 'Cari referensi atau supplier...'
                            }
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-11 pl-9 md:h-9"
                        />
                    </div>
                </DataTable>
            </CardContent>
            {/* Outside table cells: column rerenders must not remount an open dialog/input. */}
            <AlertDialog
                open={Boolean(confirmPayment)}
                onOpenChange={(open) => !open && setConfirmPayment(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirmPayment?.settlementId
                                ? 'Batalkan Paket Barter?'
                                : 'Hapus Catatan Pembayaran?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmPayment?.settlementId
                                ? 'Seluruh kaki barter dan pembayaran tambahan akan dibatalkan secara buku. Ini bukan instruksi pengembalian uang.'
                                : 'Ini akan menghapus pembayaran beserta entri jurnal General Ledger terkait. Status invoice akan dihitung ulang.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {confirmPayment?.settlementId && (
                        <div className="space-y-2">
                            <Label htmlFor="payment-void-reason">
                                Alasan pembatalan
                            </Label>
                            <Input
                                id="payment-void-reason"
                                value={voidReasons[confirmPayment.id] ?? ''}
                                onChange={(event) =>
                                    setVoidReasons((previous) => ({
                                        ...previous,
                                        [confirmPayment.id]: event.target.value,
                                    }))
                                }
                            />
                        </div>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={
                                isDeleting !== null ||
                                Boolean(
                                    confirmPayment?.settlementId &&
                                    (
                                        voidReasons[confirmPayment.id] ?? ''
                                    ).trim().length < 5,
                                )
                            }
                            onClick={() =>
                                confirmPayment && handleDelete(confirmPayment)
                            }
                        >
                            {confirmPayment?.settlementId
                                ? 'Batalkan Barter'
                                : 'Hapus'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <Dialog
                open={Boolean(detail)}
                onOpenChange={(value) => !value && setDetail(null)}
            >
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>{detail?.settlementNumber}</DialogTitle>
                        <DialogDescription>
                            Bukti settlement piutang–hutang dan pembayaran
                            tambahan.
                        </DialogDescription>
                    </DialogHeader>
                    {detail && (
                        <div className="space-y-3 text-sm">
                            <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
                                <span>Customer</span>
                                <strong>{detail.customer.name}</strong>
                                <span>Supplier</span>
                                <strong>{detail.supplier.name}</strong>
                                <span>Invoice piutang</span>
                                <strong>{detail.invoice.invoiceNumber}</strong>
                                <span>Invoice hutang</span>
                                <strong>
                                    {detail.purchaseInvoice.invoiceNumber}
                                </strong>
                                <span>Nominal barter</span>
                                <strong>
                                    {formatRupiah(detail.barterAmount)}
                                </strong>
                                <span>Uang tambahan</span>
                                <strong>
                                    {formatRupiah(detail.cashAmount)}
                                </strong>
                                <span>Sisa piutang</span>
                                <strong>
                                    {formatRupiah(detail.receivableAfter)}
                                </strong>
                                <span>Sisa hutang</span>
                                <strong>
                                    {formatRupiah(detail.payableAfter)}
                                </strong>
                                <span>Jurnal offset</span>
                                <strong>
                                    {detail.offsetJournalNumber ?? '-'}
                                </strong>
                                <span>Jurnal uang keluar</span>
                                <strong>
                                    {detail.cashJournalNumber ?? '-'}
                                </strong>
                                <span>Status</span>
                                <strong>{detail.status}</strong>
                                <span>Dicatat oleh</span>
                                <strong>{detail.createdBy.name ?? '-'}</strong>
                            </div>
                            <p>{detail.notes}</p>
                            {detail.voidReason && (
                                <p className="text-red-600">
                                    Alasan batal: {detail.voidReason}
                                </p>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
}
