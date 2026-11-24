'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
import type { ClaimReviewItem } from '@/lib/sales/expense-claim-review';
import type { ClaimPaymentAccounts } from '@/lib/sales/expense-claim-payment-ui';
import { PayClaimDialog } from './PayClaimDialog';

const EMPTY_MESSAGE = 'Tidak ada klaim yang menunggu pencairan.';

/** Approved claims waiting for Finance, oldest first, with the pay dialog. */
export function ReimbursementQueue({
    claims,
    accounts,
}: {
    claims: ClaimReviewItem[];
    accounts: ClaimPaymentAccounts;
}) {
    const router = useRouter();
    const [selected, setSelected] = useState<ClaimReviewItem | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const handleSettled = ({
        paid,
        claimNumber,
    }: {
        paid: boolean;
        claimNumber: string;
    }) => {
        setSelected(null);
        setNotice(
            paid
                ? `Klaim ${claimNumber} berhasil dicairkan dan jurnal sudah diposting.`
                : null,
        );
        router.refresh();
    };

    return (
        <div className="space-y-4">
            {notice && (
                <p
                    role="status"
                    className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
                >
                    {notice}
                </p>
            )}
            {claims.length === 0 ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    {EMPTY_MESSAGE}
                </p>
            ) : (
                <div className="rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nomor</TableHead>
                                <TableHead>Pengaju</TableHead>
                                <TableHead>Tanggal</TableHead>
                                <TableHead>Kategori</TableHead>
                                <TableHead className="text-right">
                                    Nominal
                                </TableHead>
                                <TableHead>Keterangan</TableHead>
                                <TableHead>Nota</TableHead>
                                <TableHead>Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {claims.map((claim) => (
                                <TableRow key={claim.id}>
                                    <TableCell className="font-mono text-xs">
                                        {claim.claimNumber}
                                    </TableCell>
                                    <TableCell>
                                        {claim.user?.name ?? '-'}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap">
                                        {formatWibDate(claim.expenseDate)}
                                    </TableCell>
                                    <TableCell>
                                        {categoryLabel(claim.category)}
                                    </TableCell>
                                    <TableCell className="text-right font-medium tabular-nums">
                                        {formatRupiah(claim.amount)}
                                    </TableCell>
                                    <TableCell className="max-w-xs whitespace-pre-line text-sm">
                                        {claim.description}
                                    </TableCell>
                                    <TableCell>
                                        <ClaimReceiptLink
                                            receiptUrl={claim.receiptUrl}
                                            claimNumber={claim.claimNumber}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => {
                                                setNotice(null);
                                                setSelected(claim);
                                            }}
                                        >
                                            Cairkan
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
            <PayClaimDialog
                claim={selected}
                accounts={accounts}
                onClose={() => setSelected(null)}
                onSettled={handleSettled}
            />
        </div>
    );
}
