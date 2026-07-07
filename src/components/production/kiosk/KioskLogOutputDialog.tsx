'use client';

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { logRunningOutput } from "@/actions/production/production";
import { Loader2, Save, AlertTriangle, Users } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { getProductionUnitMeta, toBaseQuantity } from "@/lib/utils/production-units";
import { Unit } from "@prisma/client";
import { kioskLabels } from "@/lib/labels";
import { CameraCapture } from "@/components/ui/camera-capture";

interface KioskLogOutputDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    executionId: string;
    productName: string;
    primaryUnit?: string | null;
    salesUnit?: string | null;
    conversionFactor?: unknown;
    operatorId?: string;
    orderHelpers?: Array<{ id: string; name: string }>;
    onSuccess?: () => void;
}

export function KioskLogOutputDialog({
    open,
    onOpenChange,
    executionId,
    productName,
    primaryUnit,
    salesUnit,
    conversionFactor,
    operatorId,
    orderHelpers = [],
    onSuccess
}: KioskLogOutputDialogProps) {
    const [quantity, setQuantity] = useState<string>('');
    const [scrapProngkol, setScrapProngkol] = useState<string>('');
    const [scrapDaun, setScrapDaun] = useState<string>('');
    const [notes, setNotes] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [showScrapWarning, setShowScrapWarning] = useState(false);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const unitMeta = getProductionUnitMeta({ primaryUnit, salesUnit, conversionFactor });

    // Get helper IDs from order (excluding current operator)
    const helperIds = orderHelpers
        .filter(h => h.id !== operatorId)
        .map(h => h.id);

    const uploadPhoto = async (file: File): Promise<string | null> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('executionId', executionId);

        const res = await fetch('/api/upload/production-photo', { method: 'POST', body: formData });
        if (!res.ok) return null;

        const { uploadUrl, publicUrl } = await res.json();

        const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
        });
        if (!uploadRes.ok) return null;

        return publicUrl;
    };

    const submitOutput = async () => {
        const qtyNum = parseFloat(quantity);
        const baseQty = unitMeta.hasAlternateUnit
            ? toBaseQuantity(qtyNum, unitMeta.conversionFactor)
            : qtyNum;
        const prongkolNum = parseFloat(scrapProngkol) || 0;
        const daunNum = parseFloat(scrapDaun) || 0;
        const totalScrap = prongkolNum + daunNum;
        setIsLoading(true);
        try {
            // Upload photo if provided
            let photoUrl: string | undefined;
            if (photoFile) {
                setIsUploadingPhoto(true);
                photoUrl = await uploadPhoto(photoFile) || undefined;
                setIsUploadingPhoto(false);
            }

            const result = await logRunningOutput({
                executionId,
                quantityProduced: baseQty,
                enteredQuantity: unitMeta.hasAlternateUnit ? qtyNum : undefined,
                enteredUnit: unitMeta.hasAlternateUnit ? unitMeta.salesUnit as Unit : undefined,
                baseQuantityProduced: unitMeta.hasAlternateUnit ? baseQty : undefined,
                conversionFactorSnapshot: unitMeta.hasAlternateUnit ? unitMeta.conversionFactor : undefined,
                scrapQuantity: totalScrap,
                scrapProngkolQty: prongkolNum,
                scrapDaunQty: daunNum,
                notes: notes || '',
                operatorId: operatorId,
                helperIds: helperIds.length > 0 ? helperIds : undefined,
                photoUrl,
            });

            if (result.success) {
                toast.success("Hasil berhasil dicatat!");
                setQuantity('');
                setScrapProngkol('');
                setScrapDaun('');
                setNotes('');
                setShowScrapWarning(false);
                setPhotoFile(null);
                onOpenChange(false);
                if (onSuccess) onSuccess();
            } else {
                toast.error(result.error || "Gagal mencatat hasil");
            }
        } catch (error) {
            toast.error('Gagal memproses. Silakan coba lagi.');
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const qtyNum = parseFloat(quantity);
        if (!quantity || isNaN(qtyNum) || qtyNum <= 0) {
            toast.error("Masukkan jumlah hasil yang valid");
            return;
        }

        const scrapNum = (parseFloat(scrapProngkol) || 0) + (parseFloat(scrapDaun) || 0);

        // Soft warning if scrap is 0
        if (scrapNum === 0 && !showScrapWarning) {
            setShowScrapWarning(true);
            return;
        }

        await submitOutput();
    };

    const handleOpenChange = (open: boolean) => {
        if (!open) {
            setShowScrapWarning(false);
        }
        onOpenChange(open);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl">{kioskLabels.logOutput}: {productName}</DialogTitle>
                    <DialogDescription>
                        Catat hasil parsial dalam {unitMeta.displayUnit}
                        {unitMeta.hasAlternateUnit ? ` (dicatat internal sebagai ${unitMeta.primaryUnit}).` : ' sementara mesin tetap berjalan.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="log-quantity" className="text-base font-semibold">{kioskLabels.goodQuantity} ({unitMeta.displayUnit})</Label>
                            <Input
                                id="log-quantity"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                className="h-16 text-2xl font-bold bg-emerald-500/10 border-emerald-500/30 focus:border-emerald-500 focus:ring-emerald-500"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="log-scrap-prongkol" className="text-sm font-semibold text-amber-500">Scrap Prongkol ({unitMeta.primaryUnit})</Label>
                                <Input
                                    id="log-scrap-prongkol"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    className={`h-12 text-xl font-bold ${showScrapWarning
                                        ? 'bg-red-500/10 border-red-500/50 ring-2 ring-red-400 focus:border-red-500 focus:ring-red-500'
                                        : 'bg-amber-500/10 border-amber-500/30 focus:border-amber-500 focus:ring-amber-500'
                                        }`}
                                    value={scrapProngkol}
                                    onChange={(e) => {
                                        setScrapProngkol(e.target.value);
                                        if (showScrapWarning) setShowScrapWarning(false);
                                    }}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="log-scrap-daun" className="text-sm font-semibold text-amber-500">Scrap Daun ({unitMeta.primaryUnit})</Label>
                                <Input
                                    id="log-scrap-daun"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    className={`h-12 text-xl font-bold ${showScrapWarning
                                        ? 'bg-red-500/10 border-red-500/50 ring-2 ring-red-400 focus:border-red-500 focus:ring-red-500'
                                        : 'bg-amber-500/10 border-amber-500/30 focus:border-amber-500 focus:ring-amber-500'
                                        }`}
                                    value={scrapDaun}
                                    onChange={(e) => {
                                        setScrapDaun(e.target.value);
                                        if (showScrapWarning) setShowScrapWarning(false);
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Scrap Warning Banner */}
                    {showScrapWarning && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                                <div>
                                    <p className="font-semibold text-amber-800">Scrap quantity is 0</p>
                                    <p className="text-sm text-amber-700 mt-1">
                                        Apakah Anda yakin tidak ada affal/scrap dari batch ini?
                                        Jika ada, silakan isi jumlah scrap terlebih dahulu.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="border-amber-400 text-amber-700 hover:bg-amber-100"
                                    onClick={() => {
                                        setShowScrapWarning(false);
                                        // Focus on first scrap input
                                        document.getElementById('log-scrap-prongkol')?.focus();
                                    }}
                                >
                                    Isi Scrap
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    className="bg-amber-600 hover:bg-amber-700"
                                    onClick={() => submitOutput()}
                                    disabled={isLoading}
                                >
                                    {isLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                                    Ya, Tidak Ada Scrap
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Photo Capture */}
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">Foto Hasil (Opsional)</Label>
                        <CameraCapture
                            onCapture={setPhotoFile}
                            onRemove={() => setPhotoFile(null)}
                            disabled={isLoading || isUploadingPhoto}
                        />
                        {isUploadingPhoto && (
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                                <Loader2 className="h-3 w-3 animate-spin" /> Mengupload foto...
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="log-notes">Catatan (Opsional)</Label>
                        <Textarea
                            id="log-notes"
                            placeholder="contoh: Nomor Batch, ID Roll..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="bg-muted border-border"
                        />
                    </div>

                    {/* Display Order Helpers (read-only) */}
                    {orderHelpers.length > 0 && (
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                                <Users className="h-4 w-4" />
                                Tim Produksi
                            </Label>
                            <div className="flex flex-wrap gap-2 p-2 bg-muted/30 rounded-lg border">
                                {orderHelpers.map((emp) => (
                                    <span
                                        key={emp.id}
                                        className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                                            emp.id === operatorId
                                                ? 'bg-primary/20 text-primary border border-primary/30'
                                                : 'bg-muted text-muted-foreground'
                                        }`}
                                    >
                                        {emp.name}
                                        {emp.id === operatorId && ' (Anda)'}
                                    </span>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Helper ditetapkan oleh planner di SPK
                            </p>
                        </div>
                    )}

                    <DialogFooter className="gap-4 sm:gap-4">
                        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} className="h-12 text-lg">
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="h-12 text-lg bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
                        >
                            {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                                {kioskLabels.logOutput}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
