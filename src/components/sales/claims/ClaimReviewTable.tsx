import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatRupiah } from '@/lib/utils/utils';
import { formatWibDate } from '@/lib/utils/timezone';
import { categoryLabel, statusMeta } from '@/lib/sales/expense-claim-ui';
import {
    REVIEW_STATUS_TABS,
    type ClaimReviewItem,
    type ReviewStatus,
} from '@/lib/sales/expense-claim-review';
import { ClaimReceiptLink } from './ClaimReceiptLink';
import { ClaimReviewActions } from './ClaimReviewActions';

function emptyMessage(status: ReviewStatus): string {
    const label = REVIEW_STATUS_TABS.find(
        (tab) => tab.status === status,
    )?.label;
    return `Tidak ada klaim berstatus "${label}".`;
}

function ClaimRow({
    claim,
    canReview,
}: {
    claim: ClaimReviewItem;
    canReview: boolean;
}) {
    const meta = statusMeta(claim.status);
    const customer = claim.salesVisit?.customer?.name;
    return (
        <TableRow>
            <TableCell className="font-mono text-xs">
                {claim.claimNumber}
            </TableCell>
            <TableCell>{claim.user?.name ?? '-'}</TableCell>
            <TableCell className="whitespace-nowrap">
                {formatWibDate(claim.expenseDate)}
            </TableCell>
            <TableCell>{categoryLabel(claim.category)}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">
                {formatRupiah(claim.amount)}
            </TableCell>
            <TableCell className="max-w-xs space-y-1">
                <p className="whitespace-pre-line text-sm">
                    {claim.description}
                </p>
                {customer && (
                    <p className="text-xs text-muted-foreground">
                        Kunjungan: {customer}
                    </p>
                )}
                {claim.status === 'REJECTED' && claim.rejectionReason && (
                    <p className="text-xs text-red-700">
                        Alasan ditolak: {claim.rejectionReason}
                    </p>
                )}
            </TableCell>
            <TableCell>
                <ClaimReceiptLink
                    receiptUrl={claim.receiptUrl}
                    claimNumber={claim.claimNumber}
                />
            </TableCell>
            <TableCell>
                {canReview ? (
                    <ClaimReviewActions
                        claimId={claim.id}
                        claimNumber={claim.claimNumber}
                    />
                ) : (
                    <Badge className={`border ${meta.className}`}>
                        {meta.label}
                    </Badge>
                )}
            </TableCell>
        </TableRow>
    );
}

/** Review list; row actions appear only for claims still waiting (SUBMITTED). */
export function ClaimReviewTable({
    claims,
    status,
}: {
    claims: ClaimReviewItem[];
    status: ReviewStatus;
}) {
    if (claims.length === 0) {
        return (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                {emptyMessage(status)}
            </p>
        );
    }
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Nomor</TableHead>
                        <TableHead>Pengaju</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead className="text-right">Nominal</TableHead>
                        <TableHead>Keterangan</TableHead>
                        <TableHead>Nota</TableHead>
                        <TableHead>
                            {status === 'SUBMITTED' ? 'Aksi' : 'Status'}
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {claims.map((claim) => (
                        <ClaimRow
                            key={claim.id}
                            claim={claim}
                            canReview={claim.status === 'SUBMITTED'}
                        />
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
