import type { Prisma, SalesReturnStatus } from '@prisma/client';
import { effectiveReturnCreditWhere } from '@/lib/finance/effective-return-credit';

/**
 * Where a sales return stands on the receivable-credit axis. This is separate
 * from SalesReturnStatus: `deriveReturnCreditState` and `returnCreditStateWhere`
 * live together so list badges, filter chips, and counts cannot drift apart.
 * The states are disjoint and cover every return.
 */
export const RETURN_CREDIT_STATES = [
    'REVIEW',
    'READY',
    'AWAITING_GOODS',
    'DRAFT',
    'POSTED',
    'BALANCE',
    'CANCELLED',
] as const;

export type ReturnCreditState = (typeof RETURN_CREDIT_STATES)[number];

const STATE_LABELS: Record<ReturnCreditState, string> = {
    REVIEW: 'Perlu dicek',
    READY: 'Siap dikredit',
    AWAITING_GOODS: 'Menunggu barang',
    DRAFT: 'Menunggu konfirmasi',
    POSTED: 'Terposting',
    BALANCE: 'Saldo kredit',
    CANCELLED: 'Dibatalkan',
};

export function returnCreditStateLabel(state: ReturnCreditState): string {
    return STATE_LABELS[state];
}

export function parseReturnCreditState(
    value: unknown,
): ReturnCreditState | undefined {
    return RETURN_CREDIT_STATES.find((state) => state === value);
}

export type ReturnCreditStateInput = {
    status: SalesReturnStatus;
    credit: {
        status: 'REVIEW_REQUIRED' | 'POSTED' | 'REVERSED';
        recoveryActive: boolean;
    } | null;
    customerCredit: { id: string } | null;
};

export function deriveReturnCreditState(
    row: ReturnCreditStateInput,
): ReturnCreditState {
    if (row.customerCredit) return 'BALANCE';
    if (row.credit) {
        const effective =
            row.credit.status === 'POSTED' ||
            (row.credit.status === 'REVERSED' && row.credit.recoveryActive);
        return effective ? 'POSTED' : 'REVIEW';
    }
    switch (row.status) {
        case 'DRAFT':
            return 'DRAFT';
        case 'CONFIRMED':
            return 'AWAITING_GOODS';
        case 'CANCELLED':
            return 'CANCELLED';
        default:
            return 'READY';
    }
}

const NO_CREDIT = {
    customerCredit: { is: null },
    credit: { is: null },
} satisfies Prisma.SalesReturnWhereInput;

export function returnCreditStateWhere(
    state: ReturnCreditState,
): Prisma.SalesReturnWhereInput {
    switch (state) {
        case 'BALANCE':
            return { customerCredit: { isNot: null } };
        case 'POSTED':
            return {
                customerCredit: { is: null },
                credit: { is: effectiveReturnCreditWhere },
            };
        case 'REVIEW':
            return {
                customerCredit: { is: null },
                credit: { is: { NOT: effectiveReturnCreditWhere } },
            };
        case 'READY':
            return { ...NO_CREDIT, status: { in: ['RECEIVED', 'COMPLETED'] } };
        case 'AWAITING_GOODS':
            return { ...NO_CREDIT, status: 'CONFIRMED' };
        case 'DRAFT':
            return { ...NO_CREDIT, status: 'DRAFT' };
        case 'CANCELLED':
            return { ...NO_CREDIT, status: 'CANCELLED' };
    }
}
