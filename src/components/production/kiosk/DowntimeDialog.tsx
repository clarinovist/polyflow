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
    DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { logMachineDowntime } from '@/actions/production/downtime';

interface DowntimeDialogProps {
    machineId: string;
    machineName: string;
    operatorId?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactNode;
}

export function DowntimeDialog({
    machineId,
    machineName,
    operatorId,
    open: controlledOpen,
    onOpenChange,
    trigger,
}: DowntimeDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen ?? internalOpen;
    const setOpen = (nextOpen: boolean) => {
        setInternalOpen(nextOpen);
        onOpenChange?.(nextOpen);
    };
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!reason.trim()) {
            toast.error('Masukkan alasan kerusakan');
            return;
        }

        setLoading(true);

        try {
            const result = await logMachineDowntime(
                machineId,
                reason,
                operatorId,
            );
            if (result.success) {
                toast.success(
                    'Downtime tercatat. Status mesin diubah ke Maintenance.',
                );
                setOpen(false);
                setReason('');
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error('Gagal mencatat downtime');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="text-destructive flex items-center">
                        <AlertTriangle className="mr-2 h-5 w-5" /> Laporkan
                        Masalah Mesin
                    </DialogTitle>
                    <DialogDescription>
                        Melaporkan kerusakan untuk:{' '}
                        <span className="font-bold">{machineName}</span>
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="reason">
                            Alasan / Deskripsi Masalah
                        </Label>
                        <Textarea
                            id="reason"
                            placeholder="contoh: Motor panas, Belt putus..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            required
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="destructive"
                            disabled={loading}
                        >
                            {loading && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Laporkan Kerusakan
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
