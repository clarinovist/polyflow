'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { approveExpenseClaim } from '@/actions/sales/expense-claims';
import {
    CLAIM_ACTION_FAILED_MESSAGE,
    claimActionErrorMessage,
    isStaleStatus,
} from '@/lib/sales/expense-claim-review';
import { RejectClaimDialog } from './RejectClaimDialog';

/** Approve (with inline confirmation) and reject (with dialog) for one claim. */
export function ClaimReviewActions({
    claimId,
    claimNumber,
}: {
    claimId: string;
    claimNumber: string;
}) {
    const router = useRouter();
    const [isConfirming, setIsConfirming] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleApprove = async () => {
        if (isPending) return;
        setIsPending(true);
        setError(null);
        try {
            const result = await approveExpenseClaim(claimId);
            if (!result.success) {
                setError(claimActionErrorMessage(result));
                if (isStaleStatus(result)) router.refresh();
                return;
            }
            setIsConfirming(false);
            router.refresh();
        } catch {
            setError(CLAIM_ACTION_FAILED_MESSAGE);
        } finally {
            setIsPending(false);
        }
    };

    return (
        <div className="space-y-2">
            {isConfirming ? (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs">Setujui klaim ini?</span>
                    <Button
                        type="button"
                        size="sm"
                        disabled={isPending}
                        onClick={handleApprove}
                    >
                        {isPending && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        )}
                        Ya, setujui
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => setIsConfirming(false)}
                    >
                        Tidak
                    </Button>
                </div>
            ) : (
                <div className="flex gap-2">
                    <Button
                        type="button"
                        size="sm"
                        disabled={isPending}
                        onClick={() => setIsConfirming(true)}
                    >
                        Setujui
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => setIsRejecting(true)}
                    >
                        Tolak
                    </Button>
                </div>
            )}
            {error && (
                <p
                    role="alert"
                    className="text-xs font-medium text-destructive"
                >
                    {error}
                </p>
            )}
            <RejectClaimDialog
                claimId={claimId}
                claimNumber={claimNumber}
                open={isRejecting}
                onOpenChange={setIsRejecting}
                onSettled={() => router.refresh()}
            />
        </div>
    );
}
