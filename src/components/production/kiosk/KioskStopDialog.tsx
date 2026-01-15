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
    onSuccess: () => void;
}

export function KioskStopDialog({
    open,
    onOpenChange,
    executionId,
    productName,
    onSuccess
}: KioskStopDialogProps) {
    const [loading, setLoading] = useState(false);
    const [quantity, setQuantity] = useState('');
    const [scrap, setScrap] = useState('0');
    const [notes, setNotes] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const qtyNum = parseFloat(quantity);
        const scrapNum = parseFloat(scrap);

        if (isNaN(qtyNum) || qtyNum < 0) {
            toast.error("Please enter a valid quantity produced");
            return;
        }

        setLoading(true);

        try {
            const result = await stopExecution({
                executionId,
                quantityProduced: qtyNum,
                scrapQuantity: isNaN(scrapNum) ? 0 : scrapNum,
                notes
            });

            if (result.success) {
                toast.success("Job stopped and output recorded successfully!");
                onOpenChange(false);
                onSuccess();
            } else {
                toast.error(result.error || "Failed to stop job");
            }
        } catch (error) {
            toast.error("An error occurred");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Stop Job & Record Output</DialogTitle>
                    <DialogDescription>
                        Completing production for: <span className="font-semibold text-primary">{productName}</span>
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="quantity" className="text-lg">Quantity Produced</Label>
                        <Input
                            id="quantity"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            className="h-14 text-lg font-semibold"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="scrap">Scrap Quantity</Label>
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
