'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    ExternalLink,
    Info,
    LoaderCircle,
} from 'lucide-react';
import { getInventoryAdjustmentReportDetails } from '@/actions/finance/accounting';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { formatQuantity, formatRupiah } from '@/lib/utils/utils';
import type { InventoryAdjustmentReportDetails } from '@/services/accounting/inventory-adjustment-report-service';

interface InventoryAdjustmentDetailsDialogProps {
    account: {
        id: string;
        code: string;
        name: string;
        type: string;
        netBalance: number;
    } | null;
    startDate: Date;
    endDate: Date;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function sourceHref(
    sourceType: 'STOCK_OPNAME' | 'STOCK_ADJUSTMENT',
    sourceId: string | null,
) {
    return sourceType === 'STOCK_OPNAME' && sourceId
        ? `/warehouse/opname/${sourceId}`
        : '/warehouse/inventory/history';
}

export function InventoryAdjustmentDetailsDialog({
    account,
    startDate,
    endDate,
    open,
    onOpenChange,
}: InventoryAdjustmentDetailsDialogProps) {
    const [details, setDetails] =
        useState<InventoryAdjustmentReportDetails | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !account) return;

        let active = true;
        setLoading(true);
        setError(null);
        setDetails(null);

        void getInventoryAdjustmentReportDetails(account.id, startDate, endDate)
            .then((result) => {
                if (!active) return;
                if (result.success) {
                    setDetails(
                        result.data as unknown as InventoryAdjustmentReportDetails,
                    );
                } else {
                    setError(result.error);
                }
            })
            .catch(() => {
                if (active) {
                    setError('Rincian penyesuaian belum dapat dimuat.');
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [account, endDate, open, startDate]);

    const direction =
        details?.direction ?? (account?.type === 'EXPENSE' ? 'LOSS' : 'GAIN');
    const isLoss = direction === 'LOSS';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
                <DialogHeader className="border-b px-5 py-5 pr-12 sm:px-6">
                    <div className="flex items-start gap-3">
                        <div
                            className={`mt-0.5 rounded-full p-2 ${isLoss ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-600'}`}
                        >
                            {isLoss ? (
                                <ArrowDown className="h-5 w-5" />
                            ) : (
                                <ArrowUp className="h-5 w-5" />
                            )}
                        </div>
                        <div className="min-w-0 space-y-1">
                            <DialogTitle>
                                {isLoss
                                    ? 'Stok berkurang karena penyesuaian'
                                    : 'Stok bertambah karena penyesuaian'}
                            </DialogTitle>
                            <DialogDescription>
                                {isLoss
                                    ? 'Stok yang dicatat lebih kecil daripada stok sistem, umumnya dari hasil opname. Selisih ini mengurangi nilai persediaan dan laba.'
                                    : 'Stok yang dicatat lebih besar daripada stok sistem, umumnya dari hasil opname. Selisih ini menambah nilai persediaan dan laba, bukan pendapatan penjualan.'}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="max-h-[calc(92dvh-8rem)] overflow-y-auto px-5 py-5 sm:px-6">
                    {loading ? (
                        <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground">
                            <LoaderCircle className="h-5 w-5 animate-spin" />
                            Memuat kejadian stok...
                        </div>
                    ) : error ? (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                            {error}
                        </div>
                    ) : details ? (
                        <div className="space-y-5">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-lg border bg-muted/20 p-4">
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Total dampak
                                    </p>
                                    <p
                                        className={`mt-1 text-xl font-bold ${isLoss ? 'text-red-600' : 'text-emerald-600'}`}
                                    >
                                        {formatRupiah(details.totalAmount)}
                                    </p>
                                </div>
                                <div className="rounded-lg border bg-muted/20 p-4">
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Kejadian stok
                                    </p>
                                    <p className="mt-1 text-xl font-bold">
                                        {details.eventCount}
                                    </p>
                                </div>
                            </div>

                            {details.events.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                                    Tidak ada kejadian stock adjustment yang
                                    terhubung untuk periode ini.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {details.events.map((event) => (
                                        <article
                                            key={event.journalId}
                                            className="rounded-lg border p-4 shadow-xs"
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0">
                                                    <p className="font-semibold">
                                                        {event.productName}
                                                        {event.variantName !==
                                                            event.productName && (
                                                            <span className="font-normal text-muted-foreground">
                                                                {' '}
                                                                ·{' '}
                                                                {
                                                                    event.variantName
                                                                }
                                                            </span>
                                                        )}
                                                    </p>
                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                        {event.locationName} ·{' '}
                                                        {event.effectiveDate}
                                                    </p>
                                                </div>
                                                <div className="text-left sm:text-right">
                                                    <p
                                                        className={`font-mono font-semibold ${isLoss ? 'text-red-600' : 'text-emerald-600'}`}
                                                    >
                                                        {isLoss ? '−' : '+'}
                                                        {formatQuantity(
                                                            event.quantity,
                                                        )}{' '}
                                                        {event.unit}
                                                    </p>
                                                    <p className="font-mono text-sm font-medium">
                                                        {formatRupiah(
                                                            event.amount,
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            {event.systemQuantity !== null &&
                                                event.countedQuantity !== null && (
                                                    <div className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
                                                        Stok sistem{' '}
                                                        <span className="font-mono font-medium">
                                                            {formatQuantity(
                                                                event.systemQuantity,
                                                            )}{' '}
                                                            {event.unit}
                                                        </span>{' '}
                                                        → hasil opname{' '}
                                                        <span className="font-mono font-medium">
                                                            {formatQuantity(
                                                                event.countedQuantity,
                                                            )}{' '}
                                                            {event.unit}
                                                        </span>
                                                    </div>
                                                )}

                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <Badge variant="outline">
                                                    {event.sourceType ===
                                                    'STOCK_OPNAME'
                                                        ? 'Stock opname'
                                                        : 'Penyesuaian stok'}
                                                </Badge>
                                                {event.costBasis ===
                                                    'INFERRED' && (
                                                    <Badge
                                                        variant="outline"
                                                        className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                                    >
                                                        <AlertTriangle className="h-3 w-3" />
                                                        Biaya diinferensikan
                                                    </Badge>
                                                )}
                                            </div>

                                            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                                                <div>
                                                    <dt className="text-muted-foreground">
                                                        Sumber
                                                    </dt>
                                                    <dd className="font-medium">
                                                        {event.sourceLabel}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-muted-foreground">
                                                        Oleh
                                                    </dt>
                                                    <dd className="font-medium">
                                                        {event.actorName ??
                                                            'Tidak tercatat'}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-muted-foreground">
                                                        Unit cost
                                                    </dt>
                                                    <dd className="font-medium">
                                                        {event.unitCost == null
                                                            ? 'Tidak tersedia'
                                                            : formatRupiah(
                                                                  event.unitCost,
                                                              )}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-muted-foreground">
                                                        Alasan
                                                    </dt>
                                                    <dd className="font-medium">
                                                        {event.reason}
                                                    </dd>
                                                </div>
                                            </dl>

                                            <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                                                <Button
                                                    asChild
                                                    variant="outline"
                                                    size="sm"
                                                >
                                                    <Link
                                                        href={sourceHref(
                                                            event.sourceType,
                                                            event.sourceId,
                                                        )}
                                                    >
                                                        Lihat sumber
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                    </Link>
                                                </Button>
                                                <Button
                                                    asChild
                                                    variant="ghost"
                                                    size="sm"
                                                >
                                                    <Link
                                                        href={`/warehouse/inventory/${event.productVariantId}?tab=ledger&startDate=${event.effectiveDate}&endDate=${event.effectiveDate}`}
                                                    >
                                                        Kartu stok
                                                    </Link>
                                                </Button>
                                                <Button
                                                    asChild
                                                    variant="ghost"
                                                    size="sm"
                                                >
                                                    <Link
                                                        href={`/finance/journals/${event.journalId}`}
                                                    >
                                                        Jurnal
                                                    </Link>
                                                </Button>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}

                            <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                                <p>
                                    “Biaya diinferensikan” berarti movement lama
                                    tidak menyimpan snapshot unit cost. Nominal
                                    rupiah tetap berasal dari jurnal yang sudah
                                    diposting.
                                </p>
                            </div>
                        </div>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
}
