/**
 * Opening balance constants — role-based.
 *
 * For new code, use resolveAccount() from '@/services/accounting/account-resolver'
 * for tenant compatibility. These role names are semantic, not tenant-specific codes.
 */
import type { AccountRole } from '@/services/accounting/account-resolver';

export const OPENING_BALANCE_ROLE: AccountRole = 'opening-balance-equity';
export const AR_ROLE: AccountRole = 'accounts-receivable';
export const AP_ROLE: AccountRole = 'accounts-payable';

export interface CreateOpeningBalanceInput {
    type: 'AR' | 'AP';
    entityId: string;
    invoiceNumber: string;
    date: Date;
    dueDate: Date;
    amount: number;
    notes?: string;
}

export interface GeneralOpeningBalanceLine {
    accountId: string;
    debit: number;
    credit: number;
}

export interface UnifiedMakeOpeningBalanceInput {
    date: Date;
    generalLines: GeneralOpeningBalanceLine[];
    arEntries: CreateOpeningBalanceInput[];
    apEntries: CreateOpeningBalanceInput[];
}
