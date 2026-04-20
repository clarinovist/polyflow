export const OPENING_BALANCE_ACCOUNT_CODE = '30000';
export const AR_ACCOUNT_CODE = '11210';
export const AP_ACCOUNT_CODE = '21110';

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