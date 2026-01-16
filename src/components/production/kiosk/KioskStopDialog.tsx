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
import { stopExecution } from '@/actions/production';

interface KioskStopDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    executionId: string;
    productName: string;
    currentProduced: number;
    targetQuantity: number;
    logs: Array<{
        id: string;
        quantity: number;
        createdAt: string;
    }>;
    onSuccess: () => void;
}

export function KioskStopDialog({
    open,
    onOpenChange,
    executionId,
    productName,
    currentProduced,
    targetQuantity,
    logs,
    onSuccess
}: KioskStopDialogProps) {
    const [loading, setLoading] = useState(false);
    const [quantity, setQuantity] = useState('0');
    const [scrap, setScrap] = useState('0');
    const [notes, setNotes] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const qtyNum = parseFloat(quantity) || 0;
        const scrapNum = parseFloat(scrap) || 0;

        if (isNaN(qtyNum) || qtyNum < 0) {
            toast.error("Please enter a valid quantity produced");
            return;
        }

        setLoading(true);

        try {
            const result = await stopExecution({
                executionId,
                quantityProduced: qtyNum,
                scrapQuantity: scrapNum,
                notes
            });

            if (result.success) {
                toast.success("Job stopped successfully!");
                onOpenChange(false);
                onSuccess();
            } else {
                toast.error(result.error || "Failed to stop job");
            }
        } catch {
            toast.error("An error occurred");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Finish Job & Summary</DialogTitle>
                    <DialogDescription>
                        Reviewing production for: <span className="font-semibold text-primary">{productName}</span>.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-4 p-4 bg-muted/40 rounded-lg border border-border/50">
                    <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground uppercase font-bold">Total Produced</span>
                        <span className="text-2xl font-black text-primary">{currentProduced}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground uppercase font-bold">Target</span>
                        <span className="text-2xl font-black">{targetQuantity}</span>
                    </div>
                </div>

                {logs.length > 0 && (
                    <div className="mt-4 border rounded-md overflow-hidden">
                        <div className="bg-muted px-3 py-2 text-xs font-bold uppercase tracking-wider border-b">
                            Partial Output Logs
                        </div>
                        <div className="max-h-[150px] overflow-y-auto divide-y">
                            {logs.map((log, idx) => (
                                <div key={log.id} className="px-3 py-2 flex justify-between items-center text-sm bg-card hover:bg-accent/5">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-emerald-600">+{log.quantity}</span>
                                        <span className="text-[10px] text-muted-foreground italic">Entry #{logs.length - idx}</span>
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
                        <Label htmlFor="quantity" className="text-sm font-semibold">Any Final Additional Output?</Label>
                        <Input
                            id="quantity"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            className="h-12 text-lg font-bold border-primary/20 focus:border-primary"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground italic">If you&apos;ve already logged everything, leave this as 0.</p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="scrap">Additional Scrap Quantity</Label>
                        <Input
                            id="scrap"
                            type="number"
                            step="0.01"
                            value={scrap}
                            onChange={(e) => setScrap(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Textarea
                            id="notes"
                            placeholder="Any issues encountered?"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading} size="lg" className="w-full sm:w-auto">
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Stop & Save Record
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
