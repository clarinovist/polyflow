'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MobileEmptyState } from '@/components/mobile';
import { cancelExpenseClaim } from '@/actions/sales/expense-claims';
import { formatRupiah } from '@/lib/utils/utils';
import { formatWibDate } from '@/lib/utils/timezone';
import {
    canCancelClaim,
    categoryLabel,
    statusMeta,
    type ClaimListItem,
} from '@/lib/sales/expense-claim-ui';

const CANCEL_FAILED_MESSAGE =
    'Gagal membatalkan klaim. Periksa koneksi lalu coba lagi.';

function ClaimCard({
    claim,
    onCancelled,
}: {
    claim: ClaimListItem;
    onCancelled: () => void;
}) {
    const [isConfirming, setIsConfirming] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const meta = statusMeta(claim.status);

    const handleCancel = async () => {
        setIsCancelling(true);
        setError(null);
        try {
            const result = await cancelExpenseClaim(claim.id);
            if (!result.success) {
                setError(result.error);
                return;
            }
            setIsConfirming(false);
            onCancelled();
        } catch {
            setError(CANCEL_FAILED_MESSAGE);
        } finally {
            setIsCancelling(false);
        }
    };

    return (
        <li className="space-y-2 rounded-2xl border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">
                        {claim.claimNumber}
                    </p>
                    <p className="text-sm font-bold">
                        {categoryLabel(claim.category)} ·{' '}
                        {formatRupiah(claim.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {formatWibDate(claim.expenseDate)}
                        {claim.salesVisit?.customer?.name
                            ? ` · ${claim.salesVisit.customer.name}`
                            : ''}
                    </p>
                </div>
                <Badge className={`border ${meta.className}`}>
                    {meta.label}
                </Badge>
            </div>

            <p className="whitespace-pre-line text-xs text-foreground">
                {claim.description}
            </p>

            {claim.status === 'REJECTED' && claim.rejectionReason && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                    Alasan ditolak: {claim.rejectionReason}
                </p>
            )}

            <a
                href={claim.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-fit items-center gap-2 text-xs font-medium text-primary"
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={claim.receiptUrl}
                    alt={`Nota ${claim.claimNumber}`}
                    className="h-12 w-12 rounded object-cover"
                />
                Lihat nota
            </a>

            {error && (
                <p
                    role="alert"
                    className="text-xs font-medium text-destructive"
                >
                    {error}
                </p>
            )}

            {canCancelClaim(claim.status) &&
                (isConfirming ? (
                    <div className="flex items-center gap-2">
                        <span className="flex-1 text-xs">
                            Batalkan klaim ini?
                        </span>
                        <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={isCancelling}
                            onClick={handleCancel}
                        >
                            {isCancelling && (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            )}
                            Ya, batalkan
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isCancelling}
                            onClick={() => setIsConfirming(false)}
                        >
                            Tidak
                        </Button>
                    </div>
                ) : (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setIsConfirming(true)}
                    >
                        Batalkan
                    </Button>
                ))}
        </li>
    );
}

export function ClaimHistoryList({ claims }: { claims: ClaimListItem[] }) {
    const router = useRouter();

    return (
        <section aria-labelledby="claim-history-title" className="space-y-3">
            <h2 id="claim-history-title" className="text-base font-bold">
                Riwayat klaim
            </h2>
            {claims.length === 0 ? (
                <MobileEmptyState
                    icon={Receipt}
                    title="Belum ada klaim"
                    description="Klaim nota yang Anda ajukan akan tampil di sini."
                />
            ) : (
                <ul className="space-y-3">
                    {claims.map((claim) => (
                        <ClaimCard
                            key={claim.id}
                            claim={claim}
                            onCancelled={() => router.refresh()}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}
