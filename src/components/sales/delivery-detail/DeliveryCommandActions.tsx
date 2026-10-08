'use client';

import { useState } from 'react';
import { Check, MoreHorizontal, RotateCcw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { salesLabels } from '@/lib/labels';
import { toBusinessDateString } from '@/lib/utils/timezone';
import type { DeliveryOrderDetailData } from './types';
import { DeliveryPrintActions } from './DeliveryPrintActions';

type DeliveryDialog = 'ship' | 'cancel' | 'return' | 'reverse' | null;

interface DeliveryCommandActionsProps {
    order: DeliveryOrderDetailData;
    warehouseMode: boolean;
    nextStep: { to: string; label: string } | null;
    canShip: boolean;
    canReverseShipment: boolean;
    isLoading: boolean;
    invoices: NonNullable<
        NonNullable<DeliveryOrderDetailData['salesOrder']>['invoices']
    >;
    bundleHref: (invoiceId: string) => string;
    setShowPreview: (open: boolean) => void;
    onStatusChange: (
        status: string,
        actualShipmentDate?: string,
    ) => Promise<void>;
    onReverseShipment: (reason: string) => Promise<void>;
}

export function DeliveryCommandActions({
    order,
    warehouseMode,
    nextStep,
    canShip,
    canReverseShipment,
    isLoading,
    invoices,
    bundleHref,
    setShowPreview,
    onStatusChange,
    onReverseShipment,
}: DeliveryCommandActionsProps) {
    const [dialog, setDialog] = useState<DeliveryDialog>(null);
    const [reverseReason, setReverseReason] = useState('');
    const [actualShipmentDate, setActualShipmentDate] = useState(() =>
        toBusinessDateString(new Date()),
    );
    const [isReversing, setIsReversing] = useState(false);

    const canCancel = ['PENDING', 'LOADING'].includes(order.status);
    const canReturn =
        !warehouseMode &&
        ['SHIPPED', 'IN_TRANSIT', 'ARRIVED'].includes(order.status);
    const hasMoreActions = canCancel || canReturn || canReverseShipment;

    const setDialogOpen = (target: Exclude<DeliveryDialog, null>) =>
        (open: boolean) => {
            setDialog(open ? target : null);
            if (!open && target === 'reverse') setReverseReason('');
        };

    const submitReverse = async () => {
        if (reverseReason.trim().length < 5) return;
        setIsReversing(true);
        try {
            await onReverseShipment(reverseReason);
        } finally {
            setIsReversing(false);
        }
    };

    const submitStatus = (status: string) => async () => {
        await onStatusChange(
            status,
            status === 'SHIPPED' ? actualShipmentDate : undefined,
        );
        setDialog(null);
    };

    return (
        <>
            <div
                role="group"
                aria-label="Aksi surat jalan"
                className="flex flex-wrap items-center gap-2 [&_button]:min-h-11 [&_a]:min-h-11"
            >
                {nextStep && nextStep.to !== 'SHIPPED' && (
                    <Button
                        onClick={() => onStatusChange(nextStep.to)}
                        disabled={isLoading}
                        className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                    >
                        <Check className="h-4 w-4" />
                        {nextStep.label}
                    </Button>
                )}
                {nextStep?.to === 'SHIPPED' && (
                    <Button
                        onClick={() => setDialog('ship')}
                        disabled={isLoading || !canShip}
                        title={!canShip ? 'Kunci verifikasi muat dulu' : undefined}
                        className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                    >
                        <Check className="h-4 w-4" />
                        {salesLabels.tandaiDikirim}
                    </Button>
                )}

                <DeliveryPrintActions
                    order={order}
                    invoices={invoices}
                    bundleHref={bundleHref}
                    setShowPreview={setShowPreview}
                />

                {hasMoreActions && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" aria-label="Lainnya">
                                <MoreHorizontal className="h-4 w-4" />
                                Lainnya
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-56">
                            {canReverseShipment && (
                                <DropdownMenuItem
                                    className="min-h-11 text-blue-700 dark:text-blue-300"
                                    onSelect={() => setDialog('reverse')}
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    Batalkan Pengiriman
                                </DropdownMenuItem>
                            )}
                            {canReturn && (
                                <DropdownMenuItem
                                    className="min-h-11"
                                    onSelect={() => setDialog('return')}
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    Retur
                                </DropdownMenuItem>
                            )}
                            {(canReverseShipment || canReturn) && canCancel && (
                                <DropdownMenuSeparator />
                            )}
                            {canCancel && (
                                <DropdownMenuItem
                                    variant="destructive"
                                    className="min-h-11"
                                    onSelect={() => setDialog('cancel')}
                                >
                                    <XCircle className="h-4 w-4" />
                                    Batalkan Surat Jalan
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            <AlertDialog open={dialog === 'ship'} onOpenChange={setDialogOpen('ship')}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{salesLabels.tandaiDikirim}?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-4">
                                <p>
                                    {salesLabels.tandaiDikirimConfirm} Invoice
                                    draft akan dibuat otomatis.
                                </p>
                                <div className="space-y-1.5 text-left">
                                    <Label htmlFor="actual-shipment-date">
                                        Tanggal Penyerahan Aktual
                                    </Label>
                                    <Input
                                        id="actual-shipment-date"
                                        type="date"
                                        value={actualShipmentDate}
                                        max={toBusinessDateString(new Date())}
                                        onChange={(event) =>
                                            setActualShipmentDate(
                                                event.target.value,
                                            )
                                        }
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Tanggal ini dipakai untuk pengeluaran
                                        stok, invoice draft, dan jurnal. Tanggal
                                        Surat Jalan tetap sebagai tanggal dokumen
                                        yang disiapkan.
                                    </p>
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={submitStatus('SHIPPED')}
                            className="bg-emerald-600 hover:bg-emerald-700"
                            disabled={
                                !canShip || isLoading || !actualShipmentDate
                            }
                        >
                            Ya, {salesLabels.tandaiDikirim}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={dialog === 'cancel'} onOpenChange={setDialogOpen('cancel')}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Batalkan Delivery Order?</AlertDialogTitle>
                        <AlertDialogDescription>
                            DO {order.orderNumber} akan dibatalkan. Tindakan ini
                            tidak dapat diurungkan.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={submitStatus('CANCELLED')}
                            className="bg-red-600 hover:bg-red-700"
                            disabled={isLoading}
                        >
                            Ya, Batalkan
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={dialog === 'return'} onOpenChange={setDialogOpen('return')}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Tandai sebagai Retur?</AlertDialogTitle>
                        <AlertDialogDescription>
                            DO {order.orderNumber} akan ditandai RETURNED. Pastikan
                            barang sudah kembali.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={submitStatus('RETURNED')}
                            className="bg-orange-600 hover:bg-orange-700"
                            disabled={isLoading}
                        >
                            Ya, Tandai Retur
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={dialog === 'reverse'} onOpenChange={setDialogOpen('reverse')}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Batalkan Pengiriman DO {order.orderNumber}?
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-3">
                                <p>
                                    Stok akan dikembalikan ke{' '}
                                    {order.sourceLocation?.name ?? 'lokasi asal'},
                                    invoice draft/belum dibayar untuk SO{' '}
                                    {order.salesOrder?.orderNumber} akan dibatalkan,
                                    dan SO kembali ke status siap kirim. Tindakan ini
                                    tidak dapat diurungkan.
                                </p>
                                <label className="block space-y-1.5">
                                    <span className="text-sm font-medium text-foreground">
                                        Alasan pembatalan
                                    </span>
                                    <Textarea
                                        aria-label="Alasan pembatalan pengiriman"
                                        placeholder="Alasan pembatalan (wajib, min. 5 karakter)"
                                        value={reverseReason}
                                        onChange={(event) =>
                                            setReverseReason(event.target.value)
                                        }
                                    />
                                </label>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={submitReverse}
                            className="bg-blue-600 hover:bg-blue-700"
                            disabled={isReversing || reverseReason.trim().length < 5}
                        >
                            Ya, Batalkan Pengiriman
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
