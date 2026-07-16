'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getMachines } from '@/actions/production/machines';
import { splitProductionOrders } from '@/actions/production/production-orders';
import { Plus, Trash2, Calendar, AlertCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface BatchInput {
    plannedQuantity: number;
    plannedStartDate: string;
    machineId: string;
}

interface SplitProductionDialogProps {
    salesOrderId: string;
    productVariantId: string;
    variantName: string;
    shortageQty: number;
    isOpen: boolean;
    onClose: () => void;
}

export function SplitProductionDialog({
    salesOrderId,
    productVariantId,
    variantName,
    shortageQty,
    isOpen,
    onClose,
}: SplitProductionDialogProps) {
    const router = useRouter();
    const [isPending, setIsPending] = useState(false);
    const [machines, setMachines] = useState<{ id: string; name: string }[]>([]);
    const [batches, setBatches] = useState<BatchInput[]>([
        {
            plannedQuantity: shortageQty,
            plannedStartDate: format(new Date(), 'yyyy-MM-dd'),
            machineId: 'NONE',
        },
    ]);

    useEffect(() => {
        if (isOpen) {
            getMachines().then((res) => {
                if (res.success && res.data) {
                    setMachines(res.data as { id: string; name: string }[]);
                }
            });
            // Reset to default batch of size shortageQty
            setBatches([
                {
                    plannedQuantity: shortageQty,
                    plannedStartDate: format(new Date(), 'yyyy-MM-dd'),
                    machineId: 'NONE',
                },
            ]);
        }
    }, [isOpen, shortageQty]);

    const handleAddBatch = () => {
        setBatches([
            ...batches,
            {
                plannedQuantity: 0,
                plannedStartDate: format(new Date(), 'yyyy-MM-dd'),
                machineId: 'NONE',
            },
        ]);
    };

    const handleRemoveBatch = (index: number) => {
        setBatches(batches.filter((_, i) => i !== index));
    };

    const handleBatchChange = (index: number, key: keyof BatchInput, value: string | number) => {
        const updated = [...batches];
        if (key === 'plannedQuantity') {
            updated[index].plannedQuantity = Number(value);
        } else {
            updated[index][key] = value as string;
        }
        setBatches(updated);
    };

    const totalPlanned = batches.reduce((sum, b) => sum + b.plannedQuantity, 0);
    const isOverPlanned = totalPlanned > shortageQty;

    const handleSubmit = async () => {
        if (batches.some((b) => b.plannedQuantity <= 0)) {
            toast.error('Jumlah produksi setiap batch harus lebih besar dari 0.');
            return;
        }
        if (isOverPlanned) {
            toast.error('Total kuantitas batch melebihi sisa kebutuhan Sales Order.');
            return;
        }

        setIsPending(true);
        try {
            const formattedBatches = batches.map((b) => ({
                plannedQuantity: b.plannedQuantity,
                plannedStartDate: new Date(b.plannedStartDate),
                machineId: b.machineId === 'NONE' ? undefined : b.machineId,
            }));

            const result = await splitProductionOrders({
                salesOrderId,
                productVariantId,
                batches: formattedBatches,
            });

            if (result.success) {
                toast.success('Rencana produksi harian berhasil dibuat.');
                onClose();
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal membagi perintah kerja.');
            }
        } catch (_error) {
            toast.error('Terjadi kesalahan saat membagi perintah kerja.');
        } finally {
            setIsPending(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl bg-white dark:bg-slate-900 border dark:border-slate-800">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        Rencanakan Produksi Harian (Split Batch)
                    </DialogTitle>
                    <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
                        Membagi shortage order untuk <strong>{variantName}</strong> menjadi beberapa perintah kerja harian/batch.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 my-4">
                    {/* Shortage Summary Banner */}
                    <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 flex justify-between items-center">
                        <div>
                            <span className="text-xs text-amber-700 dark:text-amber-400 uppercase tracking-wider font-semibold">Total Kebutuhan Shortage</span>
                            <h3 className="text-2xl font-black text-amber-900 dark:text-amber-300">{shortageQty} unit</h3>
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Total Direncanakan</span>
                            <h3 className={`text-2xl font-black ${isOverPlanned ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {totalPlanned} / {shortageQty} unit
                            </h3>
                        </div>
                    </div>

                    {isOverPlanned && (
                        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400 p-2.5 rounded-lg border border-red-200 dark:border-red-900/40">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>Kuantitas yang direncanakan ({totalPlanned}) melebihi shortage ({shortageQty}). Harap kurangi.</span>
                        </div>
                    )}

                    {/* Dynamic Batch Input Rows */}
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                        {batches.map((batch, index) => (
                            <div key={index} className="flex flex-wrap md:flex-nowrap gap-3 items-end p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                <div className="w-full md:w-24 space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Batch</Label>
                                    <div className="h-10 flex items-center justify-center font-bold text-sm bg-slate-100 dark:bg-slate-800 rounded border dark:border-slate-700">
                                        #{index + 1}
                                    </div>
                                </div>

                                <div className="w-full md:flex-1 min-w-[120px] space-y-1.5">
                                    <Label className="text-xs">Jumlah Produksi</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        placeholder="Kuantitas"
                                        value={batch.plannedQuantity || ''}
                                        onChange={(e) => handleBatchChange(index, 'plannedQuantity', e.target.value)}
                                        className="h-10"
                                    />
                                </div>

                                <div className="w-full md:flex-1 min-w-[160px] space-y-1.5">
                                    <Label className="text-xs">Tanggal Mulai</Label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            type="date"
                                            value={batch.plannedStartDate}
                                            onChange={(e) => handleBatchChange(index, 'plannedStartDate', e.target.value)}
                                            className="pl-9 h-10"
                                        />
                                    </div>
                                </div>

                                <div className="w-full md:flex-1 min-w-[160px] space-y-1.5">
                                    <Label className="text-xs">Mesin (Opsional)</Label>
                                    <Select
                                        value={batch.machineId}
                                        onValueChange={(val) => handleBatchChange(index, 'machineId', val)}
                                    >
                                        <SelectTrigger className="h-10">
                                            <SelectValue placeholder="Pilih Mesin" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="NONE">Tanpa Mesin</SelectItem>
                                            {machines.map((m) => (
                                                <SelectItem key={m.id} value={m.id}>
                                                    {m.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {batches.length > 1 && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleRemoveBatch(index)}
                                        className="h-10 w-10 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 shrink-0"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleAddBatch}
                        className="w-full h-10 border-dashed border-amber-300 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/10 flex items-center justify-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Tambah Batch Harian
                    </Button>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={isPending} className="h-10">
                        Batal
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isPending || isOverPlanned || totalPlanned <= 0}
                        className="h-10 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600"
                    >
                        {isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Memproses...
                            </>
                        ) : (
                            'Buat Rencana Produksi'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
