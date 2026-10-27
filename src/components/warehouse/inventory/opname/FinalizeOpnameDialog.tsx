'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle,
    CalendarDays,
    CheckCircle2,
    Loader2,
    ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InputFailure } from '@/lib/errors/input-failure';
import { InputFailureNotice } from '@/components/shared/InputFailureNotice';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { formatQuantity } from '@/lib/utils/utils';
import { previewOpnameFinalization } from '@/actions/inventory/opname';
import type { OpnameFinalizationPreview } from '@/services/inventory/stock-opname-service';

interface FinalizeOpnameDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (effectiveDate: string) => Promise<void> | void;
    isSubmitting: boolean;
    uncountedItems?: number;
    opnameId: string;
    failure?: InputFailure | null;
}

export function FinalizeOpnameDialog({
    open,
    onOpenChange,
    onConfirm,
    isSubmitting,
    uncountedItems = 0,
    opnameId,
    failure,
}: FinalizeOpnameDialogProps) {
    const [effectiveDate, setEffectiveDate] = useState('');
    const [preview, setPreview] = useState<OpnameFinalizationPreview | null>(
        null,
    );
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [acknowledged, setAcknowledged] = useState(false);
    const today = toBusinessDateString(new Date());

    useEffect(() => {
        if (open) setEffectiveDate(today);
    }, [open, today]);

    const loadPreview = useCallback(
        async (date: string) => {
            if (!date) {
                setPreview(null);
                setPreviewError(null);
                return;
            }
            setIsLoadingPreview(true);
            setPreviewError(null);
            try {
                const result = await previewOpnameFinalization(
                    opnameId,
                    date,
                );
                if (result.success) {
                    setPreview(result.data);
                } else {
                    setPreview(null);
                    setPreviewError(result.error);
                }
            } catch {
                setPreview(null);
                setPreviewError(
                    'Gagal memuat pratinjau finalisasi. Muat ulang halaman lalu coba lagi.',
                );
            } finally {
                setIsLoadingPreview(false);
            }
        },
        [opnameId],
    );

    useEffect(() => {
        if (!open) {
            setPreview(null);
            setPreviewError(null);
            setAcknowledged(false);
            return;
        }
        if (!effectiveDate) return;
        setAcknowledged(false);
        void loadPreview(effectiveDate);
    }, [open, effectiveDate, loadPreview]);

    const blockers = preview?.blockers ?? [];
    const warnings = preview?.warnings ?? [];
    const requiresAcknowledgement =
        preview?.requiresAcknowledgement === true;
    // Finalization must never be enabled while the guard preview is missing:
    // an unloaded preview means the blockers are simply unknown.
    const previewReady = preview !== null && !isLoadingPreview;
    const isBlocked =
        !previewReady ||
        blockers.length > 0 ||
        preview?.canFinalize === false;
    const confirmDisabled =
        isSubmitting ||
        !effectiveDate ||
        isLoadingPreview ||
        isBlocked ||
        (requiresAcknowledgement && !acknowledged);

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!isSubmitting) onOpenChange(nextOpen);
            }}
        >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarDays className="h-5 w-5 text-emerald-600" />
                        Finalisasi Stock Opname
                    </DialogTitle>
                    <DialogDescription>
                        Pilih tanggal posisi stok yang dihitung. Pratinjau di
                        bawah memakai aturan finalisasi yang sama, jadi item
                        penghambat terlihat sebelum Anda menekan tombol.
                    </DialogDescription>
                </DialogHeader>

                {failure && <InputFailureNotice failure={failure} />}
                <div className="space-y-4 py-2">
                    {uncountedItems > 0 && (
                        <div
                            role="alert"
                            className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                        >
                            Masih ada {uncountedItems} item belum dihitung. Item
                            tersebut tidak akan disesuaikan.
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="opname-effective-date">
                            Tanggal Efektif
                        </Label>
                        <Input
                            id="opname-effective-date"
                            type="date"
                            value={effectiveDate}
                            max={today}
                            onChange={(event) =>
                                setEffectiveDate(event.target.value)
                            }
                            disabled={isSubmitting}
                            required
                        />
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            Pilih tanggal saat hasil hitung fisik benar-benar
                            berlaku. Kalau pemakaian atau penerimaan terjadi
                            setelah penghitungan pada hari yang sama, pilih
                            tanggal sebelumnya.
                        </p>
                    </div>

                    {isLoadingPreview && (
                        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Memeriksa prasyarat finalisasi…
                        </div>
                    )}

                    {previewError && !isLoadingPreview && (
                        <div
                            role="alert"
                            className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
                        >
                            <p className="font-semibold">
                                Pratinjau tidak dapat dimuat
                            </p>
                            <p className="opacity-90">{previewError}</p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void loadPreview(effectiveDate)}
                            >
                                Coba lagi
                            </Button>
                        </div>
                    )}

                    {preview && !isLoadingPreview && (
                        <>
                            <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                                <div className="flex flex-wrap gap-x-4 gap-y-1">
                                    <span>
                                        Dihitung:{' '}
                                        <strong>
                                            {preview.countedCount} dari{' '}
                                            {preview.itemCount}
                                        </strong>
                                    </span>
                                    <span>
                                        Item berselisih:{' '}
                                        <strong>{preview.varianceCount}</strong>
                                    </span>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                    <span>
                                        Tambah stok: Rp
                                        {preview.gainValue}
                                    </span>
                                    <span>
                                        Kurang stok: Rp
                                        {preview.lossValue}
                                    </span>
                                    <span>
                                        Neto:{' '}
                                        <strong>Rp{preview.netValue}</strong>
                                    </span>
                                </div>
                            </div>

                            {blockers.length > 0 && (
                                <div
                                    role="alert"
                                    className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
                                >
                                    <p className="flex items-center gap-2 font-semibold">
                                        <ShieldAlert className="h-4 w-4 shrink-0" />
                                        Finalisasi diblokir
                                    </p>
                                    {blockers.map((blocker) => (
                                        <div key={blocker.code}>
                                            <p className="opacity-90">
                                                {blocker.message}
                                            </p>
                                            {blocker.items &&
                                                blocker.items.length > 0 && (
                                                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                                                        {blocker.items.map(
                                                            (item) => (
                                                                <li
                                                                    key={`${blocker.code}-${item.skuCode}-${item.detail}`}
                                                                >
                                                                    <span className="font-medium">
                                                                        {
                                                                            item.skuCode
                                                                        }
                                                                    </span>{' '}
                                                                    · {item.name}
                                                                    : {item.detail}
                                                                </li>
                                                            ),
                                                        )}
                                                        {blocker.truncatedItems ? (
                                                            <li>
                                                                +{blocker.truncatedItems}{' '}
                                                                item lain
                                                            </li>
                                                        ) : null}
                                                    </ul>
                                                )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {warnings.length > 0 && (
                                <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                                    <p className="flex items-center gap-2 font-semibold">
                                        <AlertTriangle className="h-4 w-4 shrink-0" />
                                        Perlu ditinjau sebelum finalisasi
                                    </p>
                                    {warnings.map((warning) => (
                                        <div key={warning.code}>
                                            <p className="opacity-90">
                                                {warning.message}
                                            </p>
                                            {warning.items.length > 0 && (
                                                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                                                    {warning.items.map(
                                                        (item) => (
                                                            <li
                                                                key={`${warning.code}-${item.skuCode}-${item.detail}`}
                                                            >
                                                                <span className="font-medium">
                                                                    {
                                                                        item.skuCode
                                                                    }
                                                                </span>{' '}
                                                                · {item.name}:{' '}
                                                                {item.detail}
                                                            </li>
                                                        ),
                                                    )}
                                                    {warning.truncatedItems ? (
                                                        <li>
                                                            +{warning.truncatedItems}{' '}
                                                            item lain
                                                        </li>
                                                    ) : null}
                                                </ul>
                                            )}
                                        </div>
                                    ))}
                                    <label className="flex items-start gap-2 pt-1 text-xs font-medium">
                                        <input
                                            type="checkbox"
                                            className="mt-0.5 h-4 w-4"
                                            checked={acknowledged}
                                            onChange={(event) =>
                                                setAcknowledged(
                                                    event.target.checked,
                                                )
                                            }
                                            disabled={isSubmitting}
                                        />
                                        Saya sudah memeriksa peringatan di atas
                                        dan hasil hitung fisiknya benar.
                                    </label>
                                </div>
                            )}

                            {blockers.length === 0 &&
                                warnings.length === 0 && (
                                    <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                                        <span>
                                            Prasyarat lolos. Dampak neto Rp
                                            {preview.netValue} dari{' '}
                                            {preview.varianceCount} item
                                            berselisih
                                            {preview.uncountedCount > 0
                                                ? ` · ${preview.uncountedCount} item belum dihitung tidak disesuaikan`
                                                : ''}
                                            .
                                        </span>
                                    </div>
                                )}

                            {preview.outlierItems.length > 0 && (
                                <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                                    <p className="font-medium text-foreground">
                                        Item paling ekstrem
                                    </p>
                                    <ul className="mt-1 space-y-0.5">
                                        {preview.outlierItems.map((item) => (
                                            <li key={item.opnameItemId}>
                                                <span className="font-medium">
                                                    {item.skuCode}
                                                </span>{' '}
                                                · {item.name}: hitung{' '}
                                                {formatQuantity(
                                                    Number(
                                                        item.countedQuantity,
                                                    ),
                                                )}{' '}
                                                {item.unit} vs saldo{' '}
                                                {formatQuantity(
                                                    Number(item.cutoffQuantity),
                                                )}{' '}
                                                {item.unit} · dampak Rp
                                                {item.valueImpact}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}

                    <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                        Adjustment stok dan jurnal memakai tanggal efektif.
                        Finalisasi ditolak jika periode fiskalnya tertutup,
                        saldo kartu stok perlu direkonsiliasi, atau selisih akan
                        membuat stok negatif.
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        Batal
                    </Button>
                    <Button
                        type="button"
                        onClick={() => onConfirm(effectiveDate)}
                        disabled={confirmDisabled}
                        className="bg-emerald-600 hover:bg-emerald-700"
                    >
                        {isSubmitting ? (
                            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        ) : (
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        Finalisasi
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
