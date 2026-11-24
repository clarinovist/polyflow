import { ExpenseClaimStatus } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import {
    BusinessRuleError,
    NotFoundError,
    ValidationError,
} from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import {
    parseClaimInput,
    rejectClaimSchema,
    resolveExpenseDate,
    submitClaimSchema,
    type ExpenseClaimActor,
    type SubmitClaimInput,
} from '@/lib/sales/expense-claim';
import { isOwnExpenseReceiptUrl } from '@/lib/sales/expense-receipt';
import { CLAIM_VIEW_SELECT, type ClaimView } from './expense-claim-select';
import {
    CLAIM_NUMBER_MAX_ATTEMPTS,
    isUniqueViolationOn,
    nextClaimNumber,
} from './expense-claim-number';

const STALE_STATUS_CODE = 'STALE_STATUS';
/** A receipt photo backs one live claim; CANCELLED and REJECTED claims free it for reuse. */
const RECEIPT_LOCKING_STATUSES = [
    ExpenseClaimStatus.SUBMITTED,
    ExpenseClaimStatus.APPROVED,
    ExpenseClaimStatus.PAID,
];
const ENTITY_TYPE = 'ExpenseClaim';

export interface SubmitClaimContext {
    /** Tenant key prefix used by the receipt upload route. */
    tenant: string;
}

async function findByClientClaimId(
    userId: string,
    clientClaimId: string,
): Promise<ClaimView | null> {
    return prisma.expenseClaim.findFirst({
        where: { userId, clientClaimId },
        select: CLAIM_VIEW_SELECT,
    });
}

async function assertReceiptNotReused(receiptUrl: string) {
    const used = await prisma.expenseClaim.findFirst({
        where: { receiptUrl, status: { in: RECEIPT_LOCKING_STATUSES } },
        select: { id: true },
    });
    if (used) {
        throw new BusinessRuleError(
            'Foto nota ini sudah dipakai untuk klaim lain',
            { receiptUrl },
            'DUPLICATE_RECEIPT',
        );
    }
}

async function assertVisitOwnedBy(userId: string, salesVisitId?: string) {
    if (!salesVisitId) return;
    const visit = await prisma.salesVisit.findFirst({
        where: { id: salesVisitId, userId },
        select: { id: true },
    });
    if (!visit) {
        throw new BusinessRuleError(
            'Kunjungan tidak ditemukan atau bukan milik Anda',
            { salesVisitId },
            'VISIT_NOT_OWNED',
        );
    }
}

async function createClaimOnce(
    userId: string,
    input: SubmitClaimInput,
    expenseDate: Date,
    now: Date,
): Promise<ClaimView> {
    return prisma.$transaction(async (tx) => {
        const claimNumber = await nextClaimNumber(tx, now);
        const claim = await tx.expenseClaim.create({
            data: {
                claimNumber,
                userId,
                salesVisitId: input.salesVisitId ?? null,
                expenseDate,
                category: input.category,
                amount: input.amount,
                description: input.description,
                receiptUrl: input.receiptUrl,
                clientClaimId: input.clientClaimId ?? null,
            },
            select: CLAIM_VIEW_SELECT,
        });
        await logActivity({
            userId,
            action: 'SUBMIT_EXPENSE_CLAIM',
            entityType: ENTITY_TYPE,
            entityId: claim.id,
            details: `Klaim reimburse ${claimNumber} diajukan`,
            toStatus: ExpenseClaimStatus.SUBMITTED,
            tx,
        });
        return claim;
    });
}

async function createClaimWithRetry(
    userId: string,
    input: SubmitClaimInput,
    expenseDate: Date,
    now: Date,
): Promise<ClaimView> {
    for (let attempt = 0; attempt < CLAIM_NUMBER_MAX_ATTEMPTS; attempt++) {
        try {
            return await createClaimOnce(userId, input, expenseDate, now);
        } catch (error) {
            if (isUniqueViolationOn(error, 'claimNumber')) continue;
            if (
                input.clientClaimId &&
                isUniqueViolationOn(error, 'clientClaimId')
            ) {
                const existing = await findByClientClaimId(
                    userId,
                    input.clientClaimId,
                );
                if (existing) return existing;
            }
            throw error;
        }
    }
    throw new BusinessRuleError(
        'Gagal membuat nomor klaim unik, silakan coba lagi',
        { attempts: CLAIM_NUMBER_MAX_ATTEMPTS },
        'CLAIM_NUMBER_ALLOCATION_FAILED',
    );
}

/**
 * Submit a claim for the signed-in user. Idempotent on `clientClaimId`: a retry
 * returns the claim already stored instead of creating a duplicate.
 */
export async function submitClaim(
    userId: string,
    raw: unknown,
    context: SubmitClaimContext,
    now: Date = new Date(),
): Promise<ClaimView> {
    const input = parseClaimInput(submitClaimSchema, raw);
    if (input.clientClaimId) {
        const existing = await findByClientClaimId(userId, input.clientClaimId);
        if (existing) return existing;
    }
    const expenseDate = resolveExpenseDate(input.expenseDate, now);
    if (!isOwnExpenseReceiptUrl(input.receiptUrl, context.tenant, userId)) {
        throw new ValidationError(
            'Foto nota tidak valid, unggah ulang foto nota',
        );
    }
    await assertReceiptNotReused(input.receiptUrl);
    await assertVisitOwnedBy(userId, input.salesVisitId);
    return createClaimWithRetry(userId, input, expenseDate, now);
}

function staleStatus(claimId: string, count: number) {
    return new BusinessRuleError(
        `Klaim ${claimId} sudah berubah status, silakan refresh`,
        { claimId, count },
        STALE_STATUS_CODE,
    );
}

/** Owner withdraws a still-SUBMITTED claim. Non-owners see the same "not found". */
export async function cancelClaim(
    claimId: string,
    actorId: string,
): Promise<ClaimView> {
    return prisma.$transaction(async (tx) => {
        const claim = await tx.expenseClaim.findUnique({
            where: { id: claimId },
            select: { id: true, userId: true, status: true, claimNumber: true },
        });
        if (!claim || claim.userId !== actorId) {
            throw new NotFoundError('Klaim reimburse', claimId);
        }
        if (claim.status !== ExpenseClaimStatus.SUBMITTED) {
            throw new BusinessRuleError(
                `Hanya klaim berstatus SUBMITTED yang dapat dibatalkan. Status saat ini: ${claim.status}`,
                { claimId, status: claim.status },
                'INVALID_EXPENSE_CLAIM_STATUS',
            );
        }
        const { count } = await tx.expenseClaim.updateMany({
            where: {
                id: claimId,
                userId: actorId,
                status: ExpenseClaimStatus.SUBMITTED,
            },
            data: { status: ExpenseClaimStatus.CANCELLED },
        });
        if (count !== 1) throw staleStatus(claimId, count);
        await logActivity({
            userId: actorId,
            action: 'CANCEL_EXPENSE_CLAIM',
            entityType: ENTITY_TYPE,
            entityId: claimId,
            details: `Klaim reimburse ${claim.claimNumber} dibatalkan pengaju`,
            fromStatus: ExpenseClaimStatus.SUBMITTED,
            toStatus: ExpenseClaimStatus.CANCELLED,
            tx,
        });
        return tx.expenseClaim.findUniqueOrThrow({
            where: { id: claimId },
            select: CLAIM_VIEW_SELECT,
        });
    });
}

type ReviewDecision = 'APPROVED' | 'REJECTED';

async function reviewClaim(
    claimId: string,
    actor: ExpenseClaimActor,
    decision: ReviewDecision,
    rejectionReason: string | null,
    now: Date,
): Promise<ClaimView> {
    return prisma.$transaction(async (tx) => {
        const claim = await tx.expenseClaim.findUnique({
            where: { id: claimId },
            select: { id: true, userId: true, status: true, claimNumber: true },
        });
        if (!claim) throw new NotFoundError('Klaim reimburse', claimId);
        if (claim.status !== ExpenseClaimStatus.SUBMITTED) {
            throw new BusinessRuleError(
                `Hanya klaim berstatus SUBMITTED yang dapat ditinjau. Status saat ini: ${claim.status}`,
                { claimId, status: claim.status },
                'INVALID_EXPENSE_CLAIM_STATUS',
            );
        }
        if (!actor.isAdmin && claim.userId === actor.id) {
            throw new BusinessRuleError(
                'Anda tidak boleh meninjau klaim yang diajukan sendiri',
                { claimId, actorId: actor.id },
                'SELF_APPROVAL_NOT_ALLOWED',
            );
        }
        const { count } = await tx.expenseClaim.updateMany({
            where: { id: claimId, status: ExpenseClaimStatus.SUBMITTED },
            data: {
                status: decision,
                reviewedById: actor.id,
                reviewedAt: now,
                rejectionReason,
            },
        });
        if (count !== 1) throw staleStatus(claimId, count);
        await logActivity({
            userId: actor.id,
            action:
                decision === 'APPROVED'
                    ? 'APPROVE_EXPENSE_CLAIM'
                    : 'REJECT_EXPENSE_CLAIM',
            entityType: ENTITY_TYPE,
            entityId: claimId,
            details: rejectionReason
                ? `Klaim ${claim.claimNumber} ditolak: ${rejectionReason}`
                : `Klaim ${claim.claimNumber} disetujui`,
            fromStatus: ExpenseClaimStatus.SUBMITTED,
            toStatus: decision,
            tx,
        });
        return tx.expenseClaim.findUniqueOrThrow({
            where: { id: claimId },
            select: CLAIM_VIEW_SELECT,
        });
    });
}

export async function approveClaim(
    claimId: string,
    actor: ExpenseClaimActor,
    now: Date = new Date(),
): Promise<ClaimView> {
    return reviewClaim(claimId, actor, 'APPROVED', null, now);
}

export async function rejectClaim(
    claimId: string,
    actor: ExpenseClaimActor,
    reason: string,
    now: Date = new Date(),
): Promise<ClaimView> {
    const input = parseClaimInput(rejectClaimSchema, { claimId, reason });
    return reviewClaim(claimId, actor, 'REJECTED', input.reason, now);
}
