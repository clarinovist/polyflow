'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface FinalizeOpnameDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (effectiveDate: string) => Promise<void> | void;
    isSubmitting: boolean;
    uncountedItems?: number;
}

export function FinalizeOpnameDialog({
    open,
    onOpenChange,
    onConfirm,
    isSubmitting,
    uncountedItems = 0,
}: FinalizeOpnameDialogProps) {
    const [effectiveDate, setEffectiveDate] = useState('');
    const today = toBusinessDateString(new Date());

    useEffect(() => {
        if (open) setEffectiveDate(today);
    }, [open, today]);

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!isSubmitting) onOpenChange(nextOpen);
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarDays className="h-5 w-5 text-emerald-600" />
                        Finalisasi Stock Opname
                    </DialogTitle>
                    <DialogDescription>
                        Pilih tanggal posisi stok yang dihitung. Waktu klik
                        finalisasi tetap disimpan terpisah untuk audit.
                    </DialogDescription>
                </DialogHeader>

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
                            Jika memilih tanggal lampau, sistem menghitung
                            selisih dari kartu stok pada akhir tanggal tersebut
                            dan tetap mempertahankan seluruh mutasi sesudahnya.
                        </p>
                    </div>

                    <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                        Adjustment stok dan jurnal akan memakai tanggal efektif.
                        Finalisasi ditolak jika periode fiskalnya tertutup atau
                        saldo kartu stok perlu direkonsiliasi.
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
                        disabled={isSubmitting || !effectiveDate}
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
