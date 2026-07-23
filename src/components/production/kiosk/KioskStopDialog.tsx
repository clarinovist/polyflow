'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { stopExecution } from '@/actions/production/production';
import { getProductionUnitMeta, toBaseQuantity } from '@/lib/utils/production-units';
import { Unit } from '@prisma/client';
import { kioskLabels } from '@/lib/labels';

interface KioskStopDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    executionId: string;
    productName: string;
    primaryUnit?: string | null;
    salesUnit?: string | null;
    conversionFactor?: unknown;
    currentProduced: number;
    targetQuantity: number;
    logs: Array<{
        id: string;
        quantity: number;
        createdAt: string;
    }>;
    operatorId?: string;
    onSuccess: () => void;
}

export function KioskStopDialog({
    open,
    onOpenChange,
    executionId,
    productName,
    primaryUnit,
    salesUnit,
    conversionFactor,
    currentProduced,
    targetQuantity,
    logs,
    operatorId,
    onSuccess
}: KioskStopDialogProps) {
    const [loading, setLoading] = useState(false);
    const [quantity, setQuantity] = useState('0');
    const [scrapProngkol, setScrapProngkol] = useState('0');
    const [scrapDaun, setScrapDaun] = useState('0');
    const [notes, setNotes] = useState('');
    const [completed, setCompleted] = useState(false);
    const unitMeta = getProductionUnitMeta({ primaryUnit, salesUnit, conversionFactor });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const qtyNum = parseFloat(quantity) || 0;
        const prongkolNum = parseFloat(scrapProngkol) || 0;
        const daunNum = parseFloat(scrapDaun) || 0;
        const totalScrap = prongkolNum + daunNum;
        const baseQty = unitMeta.hasAlternateUnit
            ? toBaseQuantity(qtyNum, unitMeta.conversionFactor)
            : qtyNum;

        if (isNaN(qtyNum) || qtyNum < 0) {
            toast.error("Masukkan jumlah hasil yang valid");
            return;
        }

        setLoading(true);

        try {
            const result = await stopExecution({
                executionId,
                quantityProduced: baseQty,
                enteredQuantity: unitMeta.hasAlternateUnit && qtyNum > 0 ? qtyNum : undefined,
                enteredUnit: unitMeta.hasAlternateUnit && qtyNum > 0 ? unitMeta.salesUnit as Unit : undefined,
                baseQuantityProduced: unitMeta.hasAlternateUnit && qtyNum > 0 ? baseQty : undefined,
                conversionFactorSnapshot: unitMeta.hasAlternateUnit && qtyNum > 0 ? unitMeta.conversionFactor : undefined,
                scrapQuantity: totalScrap,
                scrapProngkolQty: prongkolNum,
                scrapDaunQty: daunNum,
                notes,
                completed,
                operatorId: operatorId
            });

            if (result.success) {
                toast.success("SPK berhasil diselesaikan!");
                onOpenChange(false);
                onSuccess();
            } else {
                toast.error(result.error || "Gagal menyelesaikan SPK");
            }
        } catch {
            toast.error('Gagal memproses. Silakan coba lagi.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl">{kioskLabels.completeJob}</DialogTitle>
                    <DialogDescription>
                        Meninjau produksi: <span className="font-semibold text-primary">{productName}</span>
                    </DialogDescription>
                </DialogHeader>

                {/* Summary */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted/40 rounded-lg border border-border/50">
                    <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground uppercase font-bold">{kioskLabels.produced}</span>
                        <span className="text-2xl font-black text-primary">{currentProduced} {unitMeta.primaryUnit}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground uppercase font-bold">{kioskLabels.target}</span>
                        <span className="text-2xl font-black">{targetQuantity} {unitMeta.primaryUnit}</span>
                    </div>
                </div>

                {/* Recent logs */}
                {logs.length > 0 && (
                    <div className="border rounded-md overflow-hidden">
                        <div className="bg-muted px-3 py-2 text-xs font-bold uppercase tracking-wider border-b">
                            Log Hasil Parsial
                        </div>
                        <div className="max-h-[120px] overflow-y-auto divide-y">
                            {logs.slice(0, 5).map((log, idx) => (
                                <div key={log.id} className="px-3 py-2 flex justify-between items-center text-sm bg-card">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-emerald-600">+{log.quantity}</span>
                                        <span className="text-[10px] text-muted-foreground">#{logs.length - idx}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground font-mono">
                                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="quantity" className="text-sm font-semibold">
                            Tambah Hasil Akhir? ({unitMeta.displayUnit})
                        </Label>
                        <Input
                            id="quantity"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            placeholder="0.00"
                            className="h-14 text-xl font-bold border-primary/20 focus:border-primary"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Kosongkan jika semua hasil sudah dicatat sebelumnya.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="scrap-prongkol" className="text-sm font-semibold">Scrap Prongkol ({unitMeta.primaryUnit})</Label>
                            <Input
                                id="scrap-prongkol"
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                className="h-12 text-lg font-bold"
                                value={scrapProngkol}
                                onChange={(e) => setScrapProngkol(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="scrap-daun" className="text-sm font-semibold">Scrap Daun ({unitMeta.primaryUnit})</Label>
                            <Input
                                id="scrap-daun"
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                className="h-12 text-lg font-bold"
                                value={scrapDaun}
                                onChange={(e) => setScrapDaun(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="notes">Catatan</Label>
                        <Textarea
                            id="notes"
                            placeholder="Ada kendala selama produksi?"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center space-x-2 py-2">
                        <input
                            type="checkbox"
                            id="completed"
                            className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                            onChange={(e) => setCompleted(e.target.checked)}
                        />
                        <Label htmlFor="completed" className="font-normal cursor-pointer text-sm">
                            Tandai SPK Selesai (Hapus dari Kiosk)
                        </Label>
                    </div>

                    <DialogFooter className="gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                            className="h-12 font-bold"
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading}
                            className="h-12 font-bold bg-emerald-600 hover:bg-emerald-700 flex-1 sm:flex-none"
                        >
                            {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                            Hentikan & Simpan
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
