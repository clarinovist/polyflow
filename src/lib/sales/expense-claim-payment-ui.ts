import { toBusinessDateString } from '@/lib/utils/timezone';
import { businessDateToEntryDate } from '@/lib/utils/timezone';
import {
    todayWib,
    type ExpenseClaimCategoryValue,
} from '@/lib/sales/expense-claim-ui';

/** Pure helpers for the Finance "Cairkan" dialog. No I/O. */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface ClaimAccountOption {
    id: string;
    code: string;
    name: string;
}

/** Suggested accounts from past paid claims; always a subset of the offered accounts. */
export interface ClaimAccountDefaults {
    expenseByCategory: Partial<Record<ExpenseClaimCategoryValue, string>>;
    paymentAccountId: string | null;
}

export interface ClaimPaymentAccounts {
    expenseAccounts: ClaimAccountOption[];
    paymentAccounts: ClaimAccountOption[];
    defaults: ClaimAccountDefaults;
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

function offeredId(
    options: ClaimAccountOption[],
    id: string | null | undefined,
): string {
    return id && options.some((option) => option.id === id) ? id : '';
}

/** Draft for the pay dialog: today, with the default accounts when still offered. */
export function initialPayDraft(
    now: Date,
    category: string,
    accounts: ClaimPaymentAccounts,
): PayDraft {
    const { expenseByCategory, paymentAccountId } = accounts.defaults;
    const expenseId = Object.hasOwn(expenseByCategory, category)
        ? expenseByCategory[category as ExpenseClaimCategoryValue]
        : undefined;
    return {
        ...emptyPayDraft(now),
        expenseAccountId: offeredId(accounts.expenseAccounts, expenseId),
        paymentAccountId: offeredId(accounts.paymentAccounts, paymentAccountId),
    };
}

/** Confirmation shown after a payment; names the journal number when known. */
export function payoutNotice(
    claimNumber: string,
    journalNumber: string | null,
): string {
    const journal = journalNumber ? `jurnal ${journalNumber}` : 'jurnal';
    return `Klaim ${claimNumber} berhasil dicairkan dan ${journal} sudah diposting.`;
}

export function accountLabel<T extends { code: string; name: string }>(
    account: T,
): string {
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
