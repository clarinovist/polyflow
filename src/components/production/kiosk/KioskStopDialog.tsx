'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { stopExecution } from '@/actions/production/production';
import { kioskLabels } from '@/lib/labels';
import { cn } from '@/lib/utils/utils';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';
import { KioskDialogClose } from '@/components/kiosk/ui/KioskDialogClose';

interface KioskStopDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    executionId: string;
    orderNumber: string;
    /** e.g. "80 KG dari 200 KG". */
    progressLabel: string;
    /** Left of the target, or null when the target is reached. */
    remainingLabel: string | null;
    operatorId?: string;
    /** Opens Catat Hasil, so the last output is recorded with its packaging. */
    onRecordOutput: () => void;
    onSuccess: () => void;
}

type StopChoice = 'pause' | 'finish';

const CHOICE =
    'grid w-full gap-1 rounded-2xl border-2 p-4 text-left transition-colors disabled:opacity-50';

/**
 * Ends this operator's shift on the SPK. One word per action: Jeda keeps the
 * SPK open, SPK selesai closes it. Output is never entered here.
 */
export function KioskStopDialog({
    open,
    onOpenChange,
    executionId,
    orderNumber,
    progressLabel,
    remainingLabel,
    operatorId,
    onRecordOutput,
    onSuccess,
}: KioskStopDialogProps) {
    const [pending, setPending] = useState<StopChoice | null>(null);
    const [error, setError] = useState('');

    const handleOpenChange = (next: boolean) => {
        if (!next) setError('');
        onOpenChange(next);
    };

    const stop = async (choice: StopChoice) => {
        setPending(choice);
        setError('');
        try {
            const result = await stopExecution({
                executionId,
                quantityProduced: 0,
                scrapQuantity: 0,
                scrapProngkolQty: 0,
                scrapDaunQty: 0,
                notes: '',
                completed: choice === 'finish',
                operatorId,
            });
            if (!result.success) {
                setError(result.error || kioskLabels.stopFailed);
                return;
            }
            toast.success(
                choice === 'finish'
                    ? kioskLabels.stopFinished
                    : kioskLabels.stopPaused,
            );
            handleOpenChange(false);
            onSuccess();
        } catch {
            setError(kioskLabels.stopFailed);
        } finally {
            setPending(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="gap-4 rounded-2xl sm:max-w-xl"
            >
                <div className="flex items-start justify-between gap-3">
                    <DialogTitle className="text-2xl font-extrabold">
                        {kioskLabels.stopTitle} {orderNumber}?
                    </DialogTitle>
                    <KioskDialogClose />
                </div>
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-kiosk-warn-soft p-3">
                    <DialogDescription className="min-w-0 flex-1 text-base text-kiosk-warn-ink">
                        {kioskLabels.stopUnrecorded}
                    </DialogDescription>
                    <button
                        type="button"
                        className={kioskButton()}
                        onClick={() => {
                            handleOpenChange(false);
                            onRecordOutput();
                        }}
                    >
                        {kioskLabels.stopRecord}
                    </button>
                </div>

                <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => stop('pause')}
                    className={cn(CHOICE, 'border-border hover:border-primary')}
                >
                    <span className="flex items-center gap-2 text-xl font-bold">
                        {kioskLabels.stopPause}
                        {pending === 'pause' && (
                            <Loader2
                                aria-hidden="true"
                                className="size-5 animate-spin"
                            />
                        )}
                    </span>
                    <span className="text-base text-muted-foreground">
                        {kioskLabels.stopPauseDesc}
                    </span>
                </button>
                <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => stop('finish')}
                    className={cn(
                        CHOICE,
                        'border-kiosk-stop hover:bg-kiosk-stop-soft',
                    )}
                >
                    <span className="flex items-center gap-2 text-xl font-bold text-kiosk-stop-ink">
                        {kioskLabels.stopFinish}
                        {pending === 'finish' && (
                            <Loader2
                                aria-hidden="true"
                                className="size-5 animate-spin"
                            />
                        )}
                    </span>
                    <span className="text-base text-muted-foreground">
                        {kioskLabels.stopFinishDesc} {progressLabel}.
                        {remainingLabel &&
                            ` Sisa ${remainingLabel} ${kioskLabels.stopFinishRest}`}
                    </span>
                </button>

                {error && (
                    <p
                        role="alert"
                        className="rounded-xl bg-kiosk-stop-soft p-3 text-base font-semibold text-kiosk-stop-ink"
                    >
                        {error}
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}
