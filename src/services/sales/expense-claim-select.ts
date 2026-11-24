import type { Prisma } from '@prisma/client';

/**
 * Minimal projection returned to callers: the submitter's name and the linked
 * visit's customer name only, never the full user/visit/customer rows.
 */
export const CLAIM_VIEW_SELECT = {
    id: true,
    claimNumber: true,
    userId: true,
    salesVisitId: true,
    expenseDate: true,
    category: true,
    amount: true,
    description: true,
    receiptUrl: true,
    status: true,
    reviewedAt: true,
    rejectionReason: true,
    paidAt: true,
    journalEntryId: true,
    journalEntry: { select: { entryNumber: true } },
    createdAt: true,
    updatedAt: true,
    user: { select: { name: true } },
    salesVisit: {
        select: {
            id: true,
            checkInTime: true,
            customer: { select: { name: true } },
        },
    },
} satisfies Prisma.ExpenseClaimSelect;

export type ClaimView = Prisma.ExpenseClaimGetPayload<{
    select: typeof CLAIM_VIEW_SELECT;
}>;

const ACCOUNT_CODE_NAME = { select: { code: true, name: true } } as const;

/** Finance "Sudah dibayar" rows: the claim view plus both accounts (code and name only). */
export const PAID_CLAIM_SELECT = {
    ...CLAIM_VIEW_SELECT,
    expenseAccount: ACCOUNT_CODE_NAME,
    paymentAccount: ACCOUNT_CODE_NAME,
} satisfies Prisma.ExpenseClaimSelect;

export type PaidClaimView = Prisma.ExpenseClaimGetPayload<{
    select: typeof PAID_CLAIM_SELECT;
}>;
