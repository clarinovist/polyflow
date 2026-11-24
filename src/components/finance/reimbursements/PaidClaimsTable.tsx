import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ClaimReceiptLink } from '@/components/sales/claims/ClaimReceiptLink';
import { formatRupiah } from '@/lib/utils/utils';
import { formatWibDate } from '@/lib/utils/timezone';
import { categoryLabel } from '@/lib/sales/expense-claim-ui';
import { accountLabel } from '@/lib/sales/expense-claim-payment-ui';
import type { PaidClaimItem } from '@/lib/sales/expense-claim-review';

const EMPTY_MESSAGE = 'Belum ada klaim yang dibayar.';
const NONE = '-';

function accountText(account: PaidClaimItem['expenseAccount']): string {
    return account ? accountLabel(account) : NONE;
}

function PaidClaimRow({ claim }: { claim: PaidClaimItem }) {
    return (
        <TableRow>
            <TableCell className="font-mono text-xs">
                {claim.claimNumber}
            </TableCell>
            <TableCell>{claim.user?.name ?? NONE}</TableCell>
            <TableCell className="whitespace-nowrap">
                {claim.paidAt ? formatWibDate(claim.paidAt) : NONE}
            </TableCell>
            <TableCell>{categoryLabel(claim.category)}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">
                {formatRupiah(claim.amount)}
            </TableCell>
            <TableCell>{accountText(claim.expenseAccount)}</TableCell>
            <TableCell>{accountText(claim.paymentAccount)}</TableCell>
            <TableCell className="font-mono text-xs">
                {claim.journalEntry?.entryNumber ?? NONE}
            </TableCell>
            <TableCell>
                <ClaimReceiptLink
                    receiptUrl={claim.receiptUrl}
                    claimNumber={claim.claimNumber}
                />
            </TableCell>
        </TableRow>
    );
}

/** Claims already paid, most recently paid first (read-only). */
export function PaidClaimsTable({ claims }: { claims: PaidClaimItem[] }) {
    if (claims.length === 0) {
        return (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                {EMPTY_MESSAGE}
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
                        <TableHead>Tanggal bayar</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead className="text-right">Nominal</TableHead>
                        <TableHead>Akun biaya</TableHead>
                        <TableHead>Akun sumber</TableHead>
                        <TableHead>Jurnal</TableHead>
                        <TableHead>Nota</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {claims.map((claim) => (
                        <PaidClaimRow key={claim.id} claim={claim} />
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
