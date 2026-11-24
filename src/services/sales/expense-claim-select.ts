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
