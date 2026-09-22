'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-react';
import type {
    Location,
    Employee,
    WorkShift,
    Machine,
    ProductVariant,
} from '@prisma/client';
import { addProductionOutput } from '@/actions/production/production';
import { productionLabels } from '@/lib/labels';
import { formatWIB, toBusinessDateString } from '@/lib/utils/timezone';
import { productionOutputDateSchema } from '@/lib/schemas/production-output-date';
import type { ExtendedProductionOrder } from './types';

interface OutputFormData {
    locations: Location[];
    operators: Employee[];
    helpers: Employee[];
    workShifts: WorkShift[];
    machines: Machine[];
    rawMaterials: ProductVariant[];
}

export function AddOutputDialog({
    order,
    formData,
}: {
    order: ExtendedProductionOrder;
    formData: OutputFormData;
}) {
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submitting = useRef(false);
    const [productionDate, setProductionDate] = useState(() =>
        toBusinessDateString(new Date()),
    );
    const [showScrapWarning, setShowScrapWarning] = useState(false);
    const [rolls, setRolls] = useState<number[]>([]);
    const [currentRollWeight, setCurrentRollWeight] = useState('');
    const [scrapProngkol, setScrapProngkol] = useState('');
    const [scrapDaun, setScrapDaun] = useState('');
    const [notes, setNotes] = useState('');
    const [selectedHelpers, setSelectedHelpers] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    function handleOpenChange(nextOpen: boolean) {
        if (submitting.current) return;
        if (nextOpen) {
            setProductionDate(toBusinessDateString(new Date()));
            setError(null);
        }
        setOpen(nextOpen);
    }

    // Keep ProductionShift IDs (not WorkShift template IDs) and existing defaults.
    const { defaultShift, defaultOperator, shiftOptions } = useMemo(() => {
        const prodShifts = order.shifts || [];
        const now = new Date();
        const activeByTime = prodShifts.find(
            (shift) =>
                now.getTime() >= new Date(shift.startTime).getTime() &&
                now.getTime() <= new Date(shift.endTime).getTime(),
        );
        const matchedWorkShift = formData.workShifts.find((shift) => {
            const time = now.getHours() * 60 + now.getMinutes();
            const [startH, startM] = shift.startTime.split(':').map(Number);
            const [endH, endM] = shift.endTime.split(':').map(Number);
            const start = startH * 60 + startM;
            const end = endH * 60 + endM;
            return start <= end
                ? time >= start && time <= end
                : time >= start || time <= end;
        });
        const active =
            activeByTime ||
            (matchedWorkShift
                ? prodShifts.find(
                      (shift) => shift.shiftName === matchedWorkShift.name,
                  )
                : null) ||
            prodShifts[0];
        return {
            defaultShift: active?.id || '',
            defaultOperator: active?.operatorId || formData.operators[0]?.id,
            shiftOptions: prodShifts,
        };
    }, [order.shifts, formData.workShifts, formData.operators]);

    const variant = order.bom.productVariant;
    const primaryUnit = variant.primaryUnit || 'KG';
    const salesUnit = variant.salesUnit;
    const conversionFactor = Number(variant.conversionFactor || 1);
    const alternate = Boolean(
        salesUnit && salesUnit !== primaryUnit && conversionFactor > 0,
    );
    const displayUnit = alternate ? salesUnit : primaryUnit;
    const totalDisplayQty = rolls.reduce((sum, quantity) => sum + quantity, 0);
    const totalBaseQty = alternate
        ? totalDisplayQty * conversionFactor
        : totalDisplayQty;

    function fail(message: string, target?: string) {
        setError(message);
        toast.error(message);
        if (target) document.getElementById(target)?.focus();
    }
    function addEntry() {
        const quantity = Number(currentRollWeight);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            fail('Jumlah hasil harus lebih dari 0.', 'wo-output-quantity');
            return;
        }
        setRolls((values) => [...values, quantity]);
        setCurrentRollWeight('');
        setError(null);
    }
    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (submitting.current) return;
        const fd = new FormData(event.currentTarget);
        const dateResult = productionOutputDateSchema.safeParse(productionDate);
        if (!dateResult.success) {
            fail(
                dateResult.error.issues[0].message,
                'wo-output-production-date',
            );
            return;
        }
        if (!fd.get('shiftId') || !fd.get('operatorId')) {
            fail(
                'Pilih shift SPK dan operator sebelum mencatat hasil.',
                'wo-output-shift',
            );
            return;
        }
        if (currentRollWeight.trim()) {
            fail(
                'Tambahkan jumlah ke daftar hasil, atau kosongkan isian sebelum menyimpan.',
                'wo-output-quantity',
            );
            return;
        }
        const prongkol = Number(scrapProngkol || 0);
        const daun = Number(scrapDaun || 0);
        if (
            ![prongkol, daun].every(
                (value) => Number.isFinite(value) && value >= 0,
            )
        ) {
            fail('Jumlah scrap tidak boleh negatif.', 'wo-output-prongkol');
            return;
        }
        if (totalBaseQty <= 0 && prongkol <= 0 && daun <= 0) {
            fail(
                'Isi hasil bagus atau scrap yang dihasilkan.',
                'wo-output-quantity',
            );
            return;
        }
        if (prongkol === 0 && daun === 0 && !showScrapWarning) {
            setShowScrapWarning(true);
            return;
        }

        submitting.current = true;
        setIsSubmitting(true);
        setError(null);
        let finalNotes = notes || '';
        if (selectedHelpers.length)
            finalNotes += `\nHelpers: ${formData.helpers
                .filter((helper) => selectedHelpers.includes(helper.id))
                .map((helper) => helper.name)
                .join(', ')}`;
        if (rolls.length)
            finalNotes += `\n[Auto-Generated] Individual ${salesUnit || 'Rolls'}: ${rolls.join(', ')}`;
        const now = new Date();
        const sendConversion = alternate && totalDisplayQty > 0;
        try {
            const result = await addProductionOutput({
                productionOrderId: order.id,
                machineId: order.machineId || undefined,
                operatorId: String(fd.get('operatorId')),
                helperIds: selectedHelpers,
                shiftId: String(fd.get('shiftId')),
                quantityProduced: totalBaseQty,
                scrapProngkolQty: prongkol,
                scrapDaunQty: daun,
                scrapQuantity: 0,
                cekGram: undefined,
                startTime: now,
                endTime: now,
                productionDate,
                notes: finalNotes,
                enteredQuantity: sendConversion ? totalDisplayQty : undefined,
                enteredUnit: sendConversion ? displayUnit : undefined,
                baseQuantityProduced: sendConversion ? totalBaseQty : undefined,
                conversionFactorSnapshot: sendConversion
                    ? conversionFactor
                    : undefined,
            } as Parameters<typeof addProductionOutput>[0]);
            if (!result.success) {
                fail(
                    result.error ||
                        'Gagal mencatat hasil. Periksa data dan coba lagi.',
                );
                return;
            }
            toast.success('Hasil produksi berhasil dicatat');
            setOpen(false);
            setRolls([]);
            setProductionDate(toBusinessDateString(new Date()));
            setScrapProngkol('');
            setScrapDaun('');
            setNotes('');
            setCurrentRollWeight('');
            setSelectedHelpers([]);
            setShowScrapWarning(false);
        } catch {
            fail(
                'Gagal menghubungi server. Periksa riwayat hasil sebelum mencoba lagi agar tidak mencatat dua kali.',
            );
        } finally {
            submitting.current = false;
            setIsSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="h-4 w-4" />
                    {productionLabels.productionOutput}
                </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[960px]">
                <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
                    <DialogTitle>Catat Hasil Produksi</DialogTitle>
                    <DialogDescription>
                        {order.orderNumber} · {variant.name} · Hasil disimpan
                        sesuai lokasi SPK.
                    </DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={onSubmit}
                    className="flex min-h-0 flex-1 flex-col"
                >
                    <div className="min-h-0 overflow-y-auto p-5">
                        {error && (
                            <p
                                role="alert"
                                className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
                            >
                                {error}
                            </p>
                        )}
                        <fieldset
                            disabled={isSubmitting}
                            className="grid min-w-0 gap-5 md:grid-cols-3"
                        >
                            <section className="space-y-4 rounded-xl border bg-muted/20 p-4">
                                <h3 className="font-semibold">Tanggal & tim</h3>
                                <div className="space-y-2">
                                    <Label htmlFor="wo-output-production-date">
                                        Tanggal Produksi (WIB)
                                    </Label>
                                    <Input
                                        id="wo-output-production-date"
                                        name="productionDate"
                                        type="date"
                                        className="min-h-11"
                                        required
                                        max={toBusinessDateString(new Date())}
                                        value={productionDate}
                                        onChange={(e) =>
                                            setProductionDate(e.target.value)
                                        }
                                        disabled={isSubmitting}
                                        aria-describedby="wo-output-date-help"
                                    />
                                    <p
                                        id="wo-output-date-help"
                                        className="text-xs text-muted-foreground"
                                    >
                                        Laporan mengikuti tanggal ini; stok dan
                                        jurnal dibukukan saat disimpan.
                                    </p>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    <span className="block">
                                        Waktu Input (WIB)
                                    </span>
                                    {formatWIB(new Date(), 'dd MMM yyyy HH:mm')}
                                </p>
                                <div className="space-y-2">
                                    <Label htmlFor="wo-output-shift">
                                        Shift SPK
                                    </Label>
                                    <select
                                        id="wo-output-shift"
                                        name="shiftId"
                                        defaultValue={defaultShift}
                                        required
                                        disabled={
                                            !shiftOptions.length || isSubmitting
                                        }
                                        className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
                                    >
                                        {!shiftOptions.length ? (
                                            <option value="">
                                                Belum ada shift
                                            </option>
                                        ) : (
                                            shiftOptions.map((shift) => (
                                                <option
                                                    key={shift.id}
                                                    value={shift.id}
                                                >
                                                    {shift.shiftName}
                                                    {shift.operator?.name
                                                        ? ` — ${shift.operator.name}`
                                                        : ''}
                                                </option>
                                            ))
                                        )}
                                    </select>
                                    {!shiftOptions.length && (
                                        <p className="text-sm text-destructive">
                                            Tambah shift di tab Bahan, tim &
                                            kualitas terlebih dahulu.
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="wo-output-operator">
                                        Operator utama
                                    </Label>
                                    <select
                                        id="wo-output-operator"
                                        name="operatorId"
                                        defaultValue={defaultOperator}
                                        required
                                        className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
                                    >
                                        {!formData.operators.length && (
                                            <option value="">
                                                Belum ada operator
                                            </option>
                                        )}
                                        {formData.operators.map((operator) => (
                                            <option
                                                key={operator.id}
                                                value={operator.id}
                                            >
                                                {operator.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <fieldset>
                                    <legend className="text-sm font-medium">
                                        Helper / asisten · opsional
                                    </legend>
                                    <div className="mt-2 max-h-40 overflow-auto rounded-md border bg-background p-2">
                                        {formData.helpers.length ? (
                                            formData.helpers.map((helper) => (
                                                <label
                                                    key={helper.id}
                                                    className="flex min-h-11 items-center gap-2 text-sm"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedHelpers.includes(
                                                            helper.id,
                                                        )}
                                                        onChange={(e) =>
                                                            setSelectedHelpers(
                                                                (values) =>
                                                                    e.target
                                                                        .checked
                                                                        ? [
                                                                              ...values,
                                                                              helper.id,
                                                                          ]
                                                                        : values.filter(
                                                                              (
                                                                                  id,
                                                                              ) =>
                                                                                  id !==
                                                                                  helper.id,
                                                                          ),
                                                            )
                                                        }
                                                    />
                                                    {helper.name}
                                                </label>
                                            ))
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                Belum ada helper.
                                            </p>
                                        )}
                                    </div>
                                </fieldset>
                            </section>
                            <div className="min-w-0 space-y-4 md:col-span-2">
                                <section className="space-y-4 rounded-xl border p-4">
                                    <div className="flex flex-wrap justify-between gap-3">
                                        <h3 className="font-semibold">
                                            Hasil bagus
                                        </h3>
                                        <p className="text-right font-semibold tabular-nums">
                                            {totalDisplayQty.toLocaleString(
                                                'id-ID',
                                            )}{' '}
                                            {displayUnit}
                                            {alternate && (
                                                <span className="block text-xs font-normal text-muted-foreground">
                                                    ={' '}
                                                    {totalBaseQty.toLocaleString(
                                                        'id-ID',
                                                    )}{' '}
                                                    {primaryUnit}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="wo-output-quantity">
                                            Jumlah per entri ({displayUnit})
                                        </Label>
                                        <div className="flex gap-2">
                                            <Input
                                                id="wo-output-quantity"
                                                placeholder={`Jumlah (${displayUnit})`}
                                                type="number"
                                                step="0.01"
                                                className="min-h-11 min-w-0 flex-1"
                                                value={currentRollWeight}
                                                onChange={(e) =>
                                                    setCurrentRollWeight(
                                                        e.target.value,
                                                    )
                                                }
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        addEntry();
                                                    }
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                onClick={addEntry}
                                                className="min-h-11"
                                                disabled={!currentRollWeight}
                                            >
                                                Tambahkan
                                            </Button>
                                        </div>
                                    </div>
                                    <ul className="max-h-52 divide-y overflow-y-auto rounded-lg border">
                                        {!rolls.length && (
                                            <li className="p-5 text-sm text-muted-foreground">
                                                Belum ada hasil bagus. Entri
                                                scrap saja tetap dapat dicatat.
                                            </li>
                                        )}
                                        {rolls.map((quantity, index) => (
                                            <li
                                                key={index}
                                                className="flex items-center justify-between gap-3 px-3 py-1 text-sm"
                                            >
                                                <span>
                                                    Entri {index + 1} ·{' '}
                                                    <b>
                                                        {quantity} {displayUnit}
                                                    </b>
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    aria-label={`Hapus entri ${index + 1}`}
                                                    className="h-11 w-11 p-0"
                                                    onClick={() =>
                                                        setRolls((values) =>
                                                            values.filter(
                                                                (_, i) =>
                                                                    i !== index,
                                                            ),
                                                        )
                                                    }
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                                <section className="space-y-4 rounded-xl border p-4">
                                    <h3 className="font-semibold">
                                        Affal / scrap
                                    </h3>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="wo-output-prongkol">
                                                Prongkol (KG)
                                            </Label>
                                            <Input
                                                id="wo-output-prongkol"
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                placeholder="0.00"
                                                className="min-h-11"
                                                value={scrapProngkol}
                                                onChange={(e) =>
                                                    setScrapProngkol(
                                                        e.target.value,
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="wo-output-daun">
                                                Daun (KG)
                                            </Label>
                                            <Input
                                                id="wo-output-daun"
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                placeholder="0.00"
                                                className="min-h-11"
                                                value={scrapDaun}
                                                onChange={(e) =>
                                                    setScrapDaun(e.target.value)
                                                }
                                            />
                                        </div>
                                    </div>
                                    {showScrapWarning && (
                                        <div
                                            role="alert"
                                            className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                                        >
                                            <p className="flex items-center gap-2 font-medium">
                                                <AlertTriangle className="h-4 w-4" />
                                                Scrap masih 0
                                            </p>
                                            <p>
                                                Pastikan tidak ada affal. Isi
                                                scrap atau konfirmasi
                                                penyimpanan tanpa scrap.
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setShowScrapWarning(
                                                            false,
                                                        );
                                                        document
                                                            .getElementById(
                                                                'wo-output-prongkol',
                                                            )
                                                            ?.focus();
                                                    }}
                                                >
                                                    Isi Scrap
                                                </Button>
                                                <Button type="submit">
                                                    Ya, Tidak Ada Scrap
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </section>
                                <div className="space-y-2">
                                    <Label htmlFor="wo-output-notes">
                                        Catatan · opsional
                                    </Label>
                                    <Textarea
                                        id="wo-output-notes"
                                        name="notes"
                                        value={notes}
                                        onChange={(e) =>
                                            setNotes(e.target.value)
                                        }
                                        placeholder="Observasi atau kendala selama produksi…"
                                    />
                                </div>
                            </div>
                        </fieldset>
                    </div>
                    <DialogFooter className="shrink-0 border-t bg-background p-4">
                        <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            onClick={() => handleOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            disabled={
                                isSubmitting ||
                                (!rolls.length && !scrapProngkol && !scrapDaun)
                            }
                            className="min-h-11"
                            aria-busy={isSubmitting}
                        >
                            {isSubmitting && (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            )}
                            {isSubmitting ? 'Mencatat…' : 'Catat Hasil'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
