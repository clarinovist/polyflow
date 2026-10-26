'use client';

import { useState } from 'react';
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
import { kioskLabels } from '@/lib/labels';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';
import { KioskDialogClose } from '@/components/kiosk/ui/KioskDialogClose';
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
                toast.success(kioskLabels.downtimeSaved);
                setOpen(false);
                setReason('');
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error(kioskLabels.downtimeFailed);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent
                showCloseButton={false}
                className="gap-4 rounded-2xl sm:max-w-xl"
            >
                <DialogHeader className="flex-row items-start justify-between gap-3 text-left">
                    <div className="grid gap-1">
                        <DialogTitle className="flex items-center gap-2 text-2xl font-extrabold text-kiosk-stop-ink">
                            <AlertTriangle
                                aria-hidden="true"
                                className="size-6"
                            />
                            {kioskLabels.focusDowntime}
                        </DialogTitle>
                        <DialogDescription className="text-base">
                            {kioskLabels.machine}:{' '}
                            <span className="font-bold">{machineName}</span>
                        </DialogDescription>
                    </div>
                    <KioskDialogClose />
                </DialogHeader>

                <form onSubmit={handleSubmit} className="grid gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="reason" className="text-base">
                            {kioskLabels.downtimeReason}
                        </Label>
                        <Textarea
                            id="reason"
                            placeholder={kioskLabels.downtimeReasonHint}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="min-h-28 text-lg"
                            required
                        />
                    </div>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <button
                            type="button"
                            className={kioskButton({
                                size: 'lg',
                                tone: 'ghost',
                            })}
                            onClick={() => setOpen(false)}
                        >
                            {kioskLabels.sessionLogoutCancel}
                        </button>
                        <button
                            type="submit"
                            className={kioskButton({
                                size: 'lg',
                                tone: 'stop',
                            })}
                            disabled={loading}
                        >
                            {loading && (
                                <Loader2
                                    aria-hidden="true"
                                    className="animate-spin"
                                />
                            )}
                            {kioskLabels.focusDowntime}
                        </button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
