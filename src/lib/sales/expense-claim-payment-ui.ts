import { toBusinessDateString } from '@/lib/utils/timezone';
import { businessDateToEntryDate } from '@/lib/utils/timezone';
import { todayWib } from '@/lib/sales/expense-claim-ui';

/** Pure helpers for the Finance "Cairkan" dialog. No I/O. */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface ClaimAccountOption {
    id: string;
    code: string;
    name: string;
}

export interface ClaimPaymentAccounts {
    expenseAccounts: ClaimAccountOption[];
    paymentAccounts: ClaimAccountOption[];
}

export interface PayDraft {
    expenseAccountId: string;
    paymentAccountId: string;
    paymentDate: string;
}

export function emptyPayDraft(now: Date): PayDraft {
    return {
        expenseAccountId: '',
        paymentAccountId: '',
        paymentDate: todayWib(now),
    };
}

export function accountLabel(account: ClaimAccountOption): string {
    return `${account.code} · ${account.name}`;
}

function isRealDate(value: string): boolean {
    if (!DATE_ONLY.test(value)) return false;
    try {
        return toBusinessDateString(businessDateToEntryDate(value)) === value;
    } catch {
        return false;
    }
}

/** First problem with the draft as a user-facing message, or null when valid. */
export function validatePayDraft(draft: PayDraft, now: Date): string | null {
    if (!draft.expenseAccountId) return 'Pilih akun biaya';
    if (!draft.paymentAccountId) return 'Pilih akun sumber dana';
    if (draft.expenseAccountId === draft.paymentAccountId) {
        return 'Akun biaya dan akun sumber dana harus berbeda';
    }
    if (!isRealDate(draft.paymentDate)) return 'Tanggal pembayaran wajib diisi';
    if (draft.paymentDate > todayWib(now)) {
        return 'Tanggal pembayaran tidak boleh di masa depan';
    }
    return null;
}

export interface PayClaimPayload extends PayDraft {
    claimId: string;
}

/** The exact payload `payExpenseClaim` expects; nothing else is sent. */
export function buildPayInput(
    claimId: string,
    draft: PayDraft,
): PayClaimPayload {
    return {
        claimId,
        expenseAccountId: draft.expenseAccountId,
        paymentAccountId: draft.paymentAccountId,
        paymentDate: draft.paymentDate,
    };
}
