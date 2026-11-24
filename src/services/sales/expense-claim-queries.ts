import { ExpenseClaimStatus } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { NotFoundError } from '@/lib/errors/errors';
import { clampTake } from '@/lib/sales/expense-claim';
import { CLAIM_VIEW_SELECT, type ClaimView } from './expense-claim-select';

const NEWEST_FIRST = [{ createdAt: 'desc' }, { id: 'desc' }] as const;
const OLDEST_FIRST = [{ createdAt: 'asc' }, { id: 'asc' }] as const;

export interface ClaimListOptions {
    take?: number;
}

export interface ClaimSummaryCounts {
    submitted: number;
    approved: number;
}

/** Only the signed-in user's own claims. */
export async function listMyClaims(
    userId: string,
    options: ClaimListOptions = {},
): Promise<ClaimView[]> {
    return prisma.expenseClaim.findMany({
        where: { userId },
        orderBy: [...NEWEST_FIRST],
        take: clampTake(options.take),
        select: CLAIM_VIEW_SELECT,
    });
}

export async function getMyClaim(
    userId: string,
    claimId: string,
): Promise<ClaimView> {
    const claim = await prisma.expenseClaim.findFirst({
        where: { id: claimId, userId },
        select: CLAIM_VIEW_SELECT,
    });
    if (!claim) throw new NotFoundError('Klaim reimburse', claimId);
    return claim;
}

/** Manager queue; defaults to claims waiting for review. */
export async function listClaimsForReview(
    options: ClaimListOptions & { status?: ExpenseClaimStatus } = {},
): Promise<ClaimView[]> {
    const status = options.status ?? ExpenseClaimStatus.SUBMITTED;
    return prisma.expenseClaim.findMany({
        where: { status },
        orderBy: [
            ...(status === ExpenseClaimStatus.SUBMITTED
                ? OLDEST_FIRST
                : NEWEST_FIRST),
        ],
        take: clampTake(options.take),
        select: CLAIM_VIEW_SELECT,
    });
}

/** Finance queue: approved claims waiting for payment, oldest first. */
export async function listClaimsForPayment(
    options: ClaimListOptions = {},
): Promise<ClaimView[]> {
    return prisma.expenseClaim.findMany({
        where: { status: ExpenseClaimStatus.APPROVED },
        orderBy: [...OLDEST_FIRST],
        take: clampTake(options.take),
        select: CLAIM_VIEW_SELECT,
    });
}

export async function getClaimsSummaryCounts(): Promise<ClaimSummaryCounts> {
    const [submitted, approved] = await Promise.all([
        prisma.expenseClaim.count({
            where: { status: ExpenseClaimStatus.SUBMITTED },
        }),
        prisma.expenseClaim.count({
            where: { status: ExpenseClaimStatus.APPROVED },
        }),
    ]);
    return { submitted, approved };
}
