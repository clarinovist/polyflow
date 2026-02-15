'use client';

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { logRunningOutput } from "@/actions/production";
import { Loader2, Save, AlertTriangle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface KioskLogOutputDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    executionId: string;
    productName: string;
    onSuccess?: () => void;
}

export function KioskLogOutputDialog({
    open,
    onOpenChange,
    executionId,
    productName,
    onSuccess
}: KioskLogOutputDialogProps) {
    const [quantity, setQuantity] = useState<string>('');
    const [scrap, setScrap] = useState<string>('');
    const [notes, setNotes] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [showScrapWarning, setShowScrapWarning] = useState(false);

    const submitOutput = async () => {
        const qtyNum = parseFloat(quantity);
        setIsLoading(true);
        try {
            const result = await logRunningOutput({
                executionId,
                quantityProduced: qtyNum,
                scrapQuantity: parseFloat(scrap) || 0,
                notes: notes || undefined
            });

            if (result.success) {
                toast.success("Output logged successfully!");
                setQuantity('');
                setScrap('');
                setNotes('');
                setShowScrapWarning(false);
                onOpenChange(false);
                if (onSuccess) onSuccess();
            } else {
                toast.error(result.error || "Failed to log output");
            }
        } catch (error) {
            toast.error("An unexpected error occurred");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const qtyNum = parseFloat(quantity);
        if (!quantity || isNaN(qtyNum) || qtyNum <= 0) {
            toast.error("Please enter a valid quantity produced");
            return;
        }

        const scrapNum = parseFloat(scrap) || 0;

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
                    <DialogTitle className="text-xl">Log Output: {productName}</DialogTitle>
                    <DialogDescription>
                        Record partial output (e.g. 1 Roll) while the machine keeps running.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="log-quantity" className="text-base font-semibold">Produced (Qty)</Label>
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
                        <div className="space-y-2">
                            <Label htmlFor="log-scrap" className="text-base font-semibold text-amber-500">Scrap (Qty)</Label>
                            <Input
                                id="log-scrap"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                className={`h-16 text-2xl font-bold ${showScrapWarning
                                    ? 'bg-red-500/10 border-red-500/50 ring-2 ring-red-400 focus:border-red-500 focus:ring-red-500'
                                    : 'bg-amber-500/10 border-amber-500/30 focus:border-amber-500 focus:ring-amber-500'
                                    }`}
                                value={scrap}
                                onChange={(e) => {
                                    setScrap(e.target.value);
                                    if (showScrapWarning) setShowScrapWarning(false);
                                }}
                            />
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
                                        // Focus on scrap input
                                        document.getElementById('log-scrap')?.focus();
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

                    <div className="space-y-2">
                        <Label htmlFor="log-notes">Notes (Optional)</Label>
                        <Textarea
                            id="log-notes"
                            placeholder="e.g. Batch Number, Roll ID..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="bg-muted border-border"
                        />
                    </div>

                    <DialogFooter className="gap-4 sm:gap-4">
                        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} className="h-12 text-lg">
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="h-12 text-lg bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
                        >
                            {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                            Log Output
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
