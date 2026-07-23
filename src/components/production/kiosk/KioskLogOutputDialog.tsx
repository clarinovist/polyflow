'use client';

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { logRunningOutput } from "@/actions/production/production";
import { Loader2, Users, Camera, CheckCircle2, ArrowLeft, ArrowRight, Save, RotateCcw } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { getProductionUnitMeta, toBaseQuantity } from "@/lib/utils/production-units";
import { Unit } from "@prisma/client";
import { kioskLabels } from "@/lib/labels";
import { CameraCapture } from "@/components/ui/camera-capture";
import { KioskStepHeader } from "@/components/kiosk/KioskStepHeader";

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

const STEPS = [
    { key: 'qty', title: kioskLabels.wizardStepQty, subtitle: kioskLabels.wizardQtyDesc },
    { key: 'scrap', title: kioskLabels.wizardStepScrap, subtitle: kioskLabels.wizardScrapDesc },
    { key: 'photo', title: kioskLabels.wizardStepFoto, subtitle: kioskLabels.wizardFotoDesc },
    { key: 'confirm', title: kioskLabels.wizardStepKonfirmasi, subtitle: kioskLabels.wizardKonfirmasiDesc },
] as const;

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
    const [step, setStep] = useState(0);
    const [quantity, setQuantity] = useState<string>('');
    const [scrapProngkol, setScrapProngkol] = useState<string>('');
    const [scrapDaun, setScrapDaun] = useState<string>('');
    const [notes, setNotes] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [loggedOutputs, setLoggedOutputs] = useState<Array<{
        quantity: number;
        unit: string;
        hasPhoto: boolean;
    }>>([]);

    const unitMeta = getProductionUnitMeta({ primaryUnit, salesUnit, conversionFactor });

    const helperIds = orderHelpers
        .filter(h => h.id !== operatorId)
        .map(h => h.id);

    const qtyNum = parseFloat(quantity) || 0;
    const prongkolNum = parseFloat(scrapProngkol) || 0;
    const daunNum = parseFloat(scrapDaun) || 0;
    const totalScrap = prongkolNum + daunNum;
    const hasScrap = totalScrap > 0;
    const hasPhoto = !!photoFile;

    const uploadPhoto = async (file: File): Promise<string | null> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('executionId', executionId);
        const res = await fetch('/api/upload/production-photo', { method: 'POST', body: formData });
        if (!res.ok) return null;
        const data = await res.json();
        return data.publicUrl || null;
    };

    const submitOutput = async () => {
        const baseQty = unitMeta.hasAlternateUnit
            ? toBaseQuantity(qtyNum, unitMeta.conversionFactor)
            : qtyNum;

        setIsLoading(true);
        try {
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
                toast.success(kioskLabels.wizardSuccessDesc);
                setLoggedOutputs(prev => [...prev, {
                    quantity: qtyNum,
                    unit: unitMeta.displayUnit,
                    hasPhoto: !!photoUrl,
                }]);
                setShowSuccess(true);
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

    const handleNext = () => {
        if (step === 0) {
            if (qtyNum < 0) {
                toast.error("Jumlah hasil tidak boleh negatif");
                return;
            }
            if (qtyNum === 0 && !hasScrap) {
                toast.error("Masukkan jumlah hasil atau scrap");
                return;
            }
        }
        if (step < STEPS.length - 1) {
            setStep(step + 1);
        }
    };

    const handleBack = () => {
        if (step > 0) {
            setStep(step - 1);
        }
    };

    const handleReset = () => {
        setQuantity('');
        setScrapProngkol('');
        setScrapDaun('');
        setNotes('');
        setPhotoFile(null);
        setShowSuccess(false);
        setStep(0);
    };

    const handleClose = () => {
        handleReset();
        setLoggedOutputs([]);
        onOpenChange(false);
    };

    const handleCatatLagi = () => {
        handleReset();
    };

    const handleOpenChange = (open: boolean) => {
        if (!open) {
            handleClose();
        } else {
            onOpenChange(open);
        }
    };

    // Success screen
    if (showSuccess) {
        return (
            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="sm:max-w-lg">
                    <div className="flex flex-col items-center py-8 space-y-4">
                        <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
                            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                        </div>
                        <h2 className="text-2xl font-black">{kioskLabels.wizardSuccessTitle}</h2>
                        <p className="text-muted-foreground text-center">{kioskLabels.wizardSuccessDesc}</p>

                        {loggedOutputs.length > 0 && (
                            <div className="w-full bg-muted/50 rounded-lg p-3 text-sm">
                                <div className="font-bold text-emerald-600">
                                    +{qtyNum.toLocaleString('id-ID')} {unitMeta.displayUnit}
                                    {hasPhoto && <Camera className="inline ml-2 h-4 w-4" />}
                                </div>
                                {loggedOutputs.length > 1 && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                        Total dicatat: {loggedOutputs.reduce((s, l) => s + l.quantity, 0).toLocaleString('id-ID')} {unitMeta.displayUnit}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex gap-3 w-full pt-4">
                            <Button
                                variant="outline"
                                className="flex-1 h-12 font-bold"
                                onClick={handleCatatLagi}
                            >
                                <RotateCcw className="mr-2 h-5 w-5" />
                                {kioskLabels.wizardCatatLagi}
                            </Button>
                            <Button
                                className="flex-1 h-12 font-bold bg-emerald-600 hover:bg-emerald-700"
                                onClick={handleClose}
                            >
                                <CheckCircle2 className="mr-2 h-5 w-5" />
                                {kioskLabels.wizardSelesai}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl">{kioskLabels.logOutput}: {productName}</DialogTitle>
                    <DialogDescription className="sr-only">
                        Wizard catat hasil produksi
                    </DialogDescription>
                </DialogHeader>

                {/* Step header with progress */}
                <KioskStepHeader
                    currentStep={step + 1}
                    totalSteps={STEPS.length}
                    title={STEPS[step].title}
                    subtitle={STEPS[step].subtitle}
                />

                {/* Step content */}
                <div className="min-h-[280px] py-4">
                    {/* Step 1: Qty */}
                    {step === 0 && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="space-y-2">
                                <Label htmlFor="log-quantity" className="text-base font-semibold">
                                    {kioskLabels.wizardQtyLabel} ({unitMeta.displayUnit})
                                </Label>
                                <Input
                                    id="log-quantity"
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    placeholder="0.00"
                                    className="h-16 text-2xl font-bold bg-emerald-500/10 border-emerald-500/30 focus:border-emerald-500 focus:ring-emerald-500"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    autoFocus
                                />
                                {unitMeta.hasAlternateUnit && (
                                    <p className="text-xs text-muted-foreground">
                                        Dicatat internal sebagai {unitMeta.primaryUnit}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Scrap */}
                    {step === 1 && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="space-y-1.5">
                                <Label htmlFor="log-scrap-prongkol" className="text-sm font-semibold text-amber-500">
                                    {kioskLabels.wizardScrapProngkol} ({unitMeta.primaryUnit})
                                </Label>
                                <Input
                                    id="log-scrap-prongkol"
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    placeholder="0.00"
                                    className="h-14 text-xl font-bold bg-amber-500/10 border-amber-500/30 focus:border-amber-500 focus:ring-amber-500"
                                    value={scrapProngkol}
                                    onChange={(e) => setScrapProngkol(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="log-scrap-daun" className="text-sm font-semibold text-amber-500">
                                    {kioskLabels.wizardScrapDaun} ({unitMeta.primaryUnit})
                                </Label>
                                <Input
                                    id="log-scrap-daun"
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    placeholder="0.00"
                                    className="h-14 text-xl font-bold bg-amber-500/10 border-amber-500/30 focus:border-amber-500 focus:ring-amber-500"
                                    value={scrapDaun}
                                    onChange={(e) => setScrapDaun(e.target.value)}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Kosongkan jika tidak ada scrap. Lanjut untuk skip.
                            </p>
                        </div>
                    )}

                    {/* Step 3: Photo */}
                    {step === 2 && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">{kioskLabels.wizardPhotoLabel}</Label>
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
                                <Label htmlFor="log-notes">{kioskLabels.wizardNotesLabel}</Label>
                                <Textarea
                                    id="log-notes"
                                    placeholder="contoh: Nomor Batch, ID Roll..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="bg-muted border-border"
                                />
                            </div>
                        </div>
                    )}

                    {/* Step 4: Confirm */}
                    {step === 3 && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            {/* Summary */}
                            <div className="bg-muted/50 rounded-xl border p-4 space-y-3">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-xs text-muted-foreground uppercase font-bold">{kioskLabels.wizardSummaryQty}</span>
                                        <p className="text-2xl font-black text-emerald-600">
                                            {qtyNum.toLocaleString('id-ID')} {unitMeta.displayUnit}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground uppercase font-bold">{kioskLabels.wizardSummaryScrap}</span>
                                        <p className="text-2xl font-black text-amber-600">
                                            {totalScrap.toLocaleString('id-ID')} {unitMeta.primaryUnit}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <Camera className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">{kioskLabels.wizardSummaryFoto}:</span>
                                    <span className={hasPhoto ? "text-emerald-600 font-bold" : "text-muted-foreground"}>
                                        {hasPhoto ? kioskLabels.wizardSummaryAda : kioskLabels.wizardSummaryTidak}
                                    </span>
                                </div>
                                {notes && (
                                    <div className="text-sm">
                                        <span className="font-medium">Catatan:</span> {notes}
                                    </div>
                                )}
                            </div>

                            {/* Helpers */}
                            {orderHelpers.length > 0 && (
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                                        <Users className="h-4 w-4" />
                                        {kioskLabels.wizardTeamLabel}
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
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <div className="flex gap-3 pt-2 border-t">
                    {step > 0 && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleBack}
                            className="h-12 font-bold px-4"
                            disabled={isLoading}
                        >
                            <ArrowLeft className="mr-1 h-4 w-4" />
                            {kioskLabels.wizardBack}
                        </Button>
                    )}

                    <div className="flex-1" />

                    {step < STEPS.length - 1 ? (
                        <Button
                            type="button"
                            onClick={handleNext}
                            className="h-12 font-bold px-8 bg-emerald-600 hover:bg-emerald-700"
                        >
                            {kioskLabels.wizardNext}
                            <ArrowRight className="ml-1 h-4 w-4" />
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            onClick={submitOutput}
                            disabled={isLoading}
                            className="h-12 font-bold px-8 bg-emerald-600 hover:bg-emerald-700"
                        >
                            {isLoading ? (
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            ) : (
                                <Save className="mr-2 h-5 w-5" />
                            )}
                            {kioskLabels.wizardSubmit}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
