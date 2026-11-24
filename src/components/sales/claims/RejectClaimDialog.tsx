'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { rejectExpenseClaim } from '@/actions/sales/expense-claims';
import { REJECTION_REASON_MAX_LENGTH } from '@/lib/sales/expense-claim';
import {
    CLAIM_ACTION_FAILED_MESSAGE,
    claimActionErrorMessage,
    isStaleStatus,
    validateRejectionReason,
} from '@/lib/sales/expense-claim-review';

interface RejectClaimDialogProps {
    claimId: string;
    claimNumber: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called after the server accepted the rejection, or reported a stale status. */
    onSettled: () => void;
}

export function RejectClaimDialog({
    claimId,
    claimNumber,
    open,
    onOpenChange,
    onSettled,
}: RejectClaimDialogProps) {
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);

    const handleOpenChange = (next: boolean) => {
        if (isPending) return;
        if (!next) {
            setReason('');
            setError(null);
        }
        onOpenChange(next);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isPending) return;
        const validation = validateRejectionReason(reason);
        if (validation) {
            setError(validation);
            return;
        }
        setIsPending(true);
        setError(null);
        try {
            const result = await rejectExpenseClaim(claimId, reason.trim());
            if (!result.success) {
                setError(claimActionErrorMessage(result));
                if (isStaleStatus(result)) onSettled();
                return;
            }
            setReason('');
            onOpenChange(false);
            onSettled();
        } catch {
            setError(CLAIM_ACTION_FAILED_MESSAGE);
        } finally {
            setIsPending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Tolak klaim {claimNumber}</DialogTitle>
                        <DialogDescription>
                            Alasan penolakan akan terlihat oleh pengaju klaim.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="reject-reason">Alasan penolakan</Label>
                        <Textarea
                            id="reject-reason"
                            value={reason}
                            maxLength={REJECTION_REASON_MAX_LENGTH}
                            disabled={isPending}
                            onChange={(event) => setReason(event.target.value)}
                        />
                    </div>
                    {error && (
                        <p
                            role="alert"
                            className="text-sm font-medium text-destructive"
                        >
                            {error}
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => handleOpenChange(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            variant="destructive"
                            disabled={isPending}
                        >
                            {isPending && (
                                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            )}
                            Tolak klaim
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
