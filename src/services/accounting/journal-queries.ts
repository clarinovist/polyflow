import { prisma } from '@/lib/core/prisma';
import { JournalStatus, Prisma } from '@prisma/client';

export async function getJournals(params?: {
    startDate?: Date;
    endDate?: Date;
    status?: JournalStatus;
    reference?: string;
    page?: number;
    limit?: number;
}) {
    const where: Prisma.JournalEntryWhereInput = {};

    if (params?.startDate && params?.endDate) {
        where.entryDate = { gte: params.startDate, lte: params.endDate };
    }
    if (params?.status) {
        where.status = params.status;
    }
    if (params?.reference) {
        where.reference = { contains: params.reference, mode: 'insensitive' };
    }

    const page = params?.page || 1;
    const limit = params?.limit || 100;
    const skip = Math.max(0, (page - 1) * limit);

    const [data, total] = await Promise.all([
        prisma.journalEntry.findMany({
            where,
            include: {
                createdBy: { select: { name: true } },
                lines: true,
            },
            orderBy: { entryDate: 'desc' },
            skip,
            take: limit,
        }),
        prisma.journalEntry.count({ where }),
    ]);

    return {
        data,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
}

/**
 * A reversal points back to its source via referenceId, so a journal can only
 * ever carry one active (POSTED) reversal. Used to block reversing or voiding
 * a journal whose balance has already been neutralised.
 */
export async function findActiveReversal(journalId: string) {
    return await prisma.journalEntry.findFirst({
        where: {
            referenceType: 'MANUAL_ENTRY',
            referenceId: journalId,
            status: JournalStatus.POSTED,
        },
        select: { id: true, entryNumber: true },
    });
}

export async function getJournalById(id: string) {
    const journal = await prisma.journalEntry.findUnique({
        where: { id },
        include: {
            lines: {
                include: { account: true },
            },
            details: {
                orderBy: { sortOrder: 'asc' },
            },
            createdBy: { select: { name: true } },
            approvedBy: { select: { name: true } },
        },
    });

    if (!journal) return null;

    // A reversed journal stays POSTED, so the detail view needs this to tell
    // the user why Void/Reverse are no longer available.
    const reversal = await findActiveReversal(id);

    return { ...journal, reversal };
}
