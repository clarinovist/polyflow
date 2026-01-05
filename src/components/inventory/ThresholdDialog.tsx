'use client';

import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateThreshold } from '@/actions/inventory';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface ThresholdDialogProps {
    productVariantId: string;
    productName: string;
    initialThreshold: number;
}

export function ThresholdDialog({
    productVariantId,
    productName,
    initialThreshold,
}: ThresholdDialogProps) {
    const [open, setOpen] = useState(false);
    const [threshold, setThreshold] = useState(initialThreshold);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSave = async () => {
        setLoading(true);
        const result = await updateThreshold(productVariantId, threshold);
        setLoading(false);

        if (result.success) {
            toast.success('Global threshold updated');
            setOpen(false);
            router.refresh();
        } else {
            toast.error(result.error || 'Failed to update threshold');
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                    <Settings2 className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Stock Threshold Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Product</p>
                        <p className="text-sm text-slate-900">{productName}</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="threshold">Min Stock Alert Threshold</Label>
                        <Input
                            id="threshold"
                            type="number"
                            step="0.01"
                            value={threshold}
                            onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
                            placeholder="e.g. 50"
                        />
                        <p className="text-[0.8rem] text-slate-500 whitespace-pre-wrap">
                            Automated alerts will be triggered when stock falls below this value.
                        </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading ? 'Saving...' : 'Save Settings'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
