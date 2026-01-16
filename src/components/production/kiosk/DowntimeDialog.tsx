'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
    DialogTrigger
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { logMachineDowntime } from '@/actions/downtime';

interface DowntimeDialogProps {
    machineId: string;
    machineName: string;
    trigger?: React.ReactNode;
}

export function DowntimeDialog({ machineId, machineName, trigger }: DowntimeDialogProps) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!reason.trim()) {
            toast.error("Please enter a reason");
            return;
        }

        setLoading(true);

        try {
            const result = await logMachineDowntime(machineId, reason); // Todo: pass User ID
            if (result.success) {
                toast.success("Downtime reported. Machine status set to Maintenance.");
                setOpen(false);
                setReason('');
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error("Failed to report downtime");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ? trigger : (
                    <Button variant="outline" size="sm" className="text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100">
                        <AlertTriangle className="mr-2 h-4 w-4" /> Report Issue
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="text-destructive flex items-center">
                        <AlertTriangle className="mr-2 h-5 w-5" /> Report Machine Issue
                    </DialogTitle>
                    <DialogDescription>
                        Reporting breakdown for: <span className="font-bold">{machineName}</span>
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="reason">Reason / Issue Description</Label>
                        <Textarea
                            id="reason"
                            placeholder="e.g. Motor overheating, Belt snapped..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            required
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button type="submit" variant="destructive" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Report Breakdown
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
