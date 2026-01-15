'use client';

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { logRunningOutput } from "@/actions/production";
import { Loader2, Save } from "lucide-react";
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const qtyNum = parseFloat(quantity);
        if (!quantity || isNaN(qtyNum) || qtyNum <= 0) {
            toast.error("Please enter a valid quantity produced");
            return;
        }

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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
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
                                className="h-16 text-2xl font-bold bg-amber-500/10 border-amber-500/30 focus:border-amber-500 focus:ring-amber-500"
                                value={scrap}
                                onChange={(e) => setScrap(e.target.value)}
                            />
                        </div>
                    </div>

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
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-12 text-lg">
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
