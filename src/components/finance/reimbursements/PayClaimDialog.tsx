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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { payExpenseClaim } from '@/actions/sales/expense-claims';
import { formatRupiah } from '@/lib/utils/utils';
import { categoryLabel } from '@/lib/sales/expense-claim-ui';
import {
    CLAIM_ACTION_FAILED_MESSAGE,
    claimActionErrorMessage,
    isStaleStatus,
    type ClaimReviewItem,
} from '@/lib/sales/expense-claim-review';
import {
    accountLabel,
    buildPayInput,
    emptyPayDraft,
    validatePayDraft,
    type ClaimAccountOption,
    type ClaimPaymentAccounts,
    type PayDraft,
} from '@/lib/sales/expense-claim-payment-ui';

interface PayClaimDialogProps {
    claim: ClaimReviewItem | null;
    accounts: ClaimPaymentAccounts;
    onClose: () => void;
    /** Called after a successful payment, or when the claim turned out stale. */
    onSettled: (outcome: { paid: boolean; claimNumber: string }) => void;
}

function AccountSelect({
    id,
    label,
    value,
    options,
    disabled,
    onChange,
}: {
    id: string;
    label: string;
    value: string;
    options: ClaimAccountOption[];
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <NativeSelect
                id={id}
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
            >
                <option value="">Pilih akun</option>
                {options.map((account) => (
                    <option key={account.id} value={account.id}>
                        {accountLabel(account)}
                    </option>
                ))}
            </NativeSelect>
        </div>
    );
}

/** Mounted only while open, so the default payment date is fixed at open time. */
function PayClaimForm({
    claim,
    accounts,
    onClose,
    onSettled,
}: Omit<PayClaimDialogProps, 'claim'> & { claim: ClaimReviewItem }) {
    const [draft, setDraft] = useState<PayDraft>(() =>
        emptyPayDraft(new Date()),
    );
    const [maxDate] = useState(() => emptyPayDraft(new Date()).paymentDate);
    const [error, setError] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);
    const hasAccounts =
        accounts.expenseAccounts.length > 0 &&
        accounts.paymentAccounts.length > 0;

    const update = (patch: Partial<PayDraft>) =>
        setDraft((current) => ({ ...current, ...patch }));

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isPending) return;
        const validation = validatePayDraft(draft, new Date());
        if (validation) {
            setError(validation);
            return;
        }
        setIsPending(true);
        setError(null);
        try {
            const result = await payExpenseClaim(
                buildPayInput(claim.id, draft),
            );
            if (!result.success) {
                setError(claimActionErrorMessage(result));
                if (isStaleStatus(result)) {
                    onSettled({ paid: false, claimNumber: claim.claimNumber });
                }
                return;
            }
            onSettled({ paid: true, claimNumber: claim.claimNumber });
        } catch {
            setError(CLAIM_ACTION_FAILED_MESSAGE);
        } finally {
            setIsPending(false);
        }
    };

    return (
        <form noValidate onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Cairkan klaim {claim.claimNumber}</DialogTitle>
                <DialogDescription>
                    {claim.user?.name ?? 'Pengaju'} ·{' '}
                    {categoryLabel(claim.category)} ·{' '}
                    {formatRupiah(claim.amount)}. Pencairan memposting jurnal:
                    debit akun biaya, kredit akun sumber dana.
                </DialogDescription>
            </DialogHeader>
            {!hasAccounts && (
                <p
                    role="alert"
                    className="text-sm font-medium text-destructive"
                >
                    Akun biaya atau akun kas/bank aktif belum tersedia di bagan
                    akun.
                </p>
            )}
            <AccountSelect
                id="pay-expense-account"
                label="Akun biaya"
                value={draft.expenseAccountId}
                options={accounts.expenseAccounts}
                disabled={isPending}
                onChange={(value) => update({ expenseAccountId: value })}
            />
            <AccountSelect
                id="pay-source-account"
                label="Akun sumber dana (kas/bank)"
                value={draft.paymentAccountId}
                options={accounts.paymentAccounts}
                disabled={isPending}
                onChange={(value) => update({ paymentAccountId: value })}
            />
            <div className="space-y-2">
                <Label htmlFor="pay-date">Tanggal pembayaran</Label>
                <Input
                    id="pay-date"
                    type="date"
                    value={draft.paymentDate}
                    max={maxDate}
                    disabled={isPending}
                    onChange={(event) =>
                        update({ paymentDate: event.target.value })
                    }
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
                    onClick={onClose}
                >
                    Batal
                </Button>
                <Button type="submit" disabled={isPending || !hasAccounts}>
                    {isPending && (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    )}
                    Cairkan
                </Button>
            </DialogFooter>
        </form>
    );
}

export function PayClaimDialog({
    claim,
    accounts,
    onClose,
    onSettled,
}: PayClaimDialogProps) {
    return (
        <Dialog
            open={claim !== null}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent>
                {claim && (
                    <PayClaimForm
                        claim={claim}
                        accounts={accounts}
                        onClose={onClose}
                        onSettled={onSettled}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
