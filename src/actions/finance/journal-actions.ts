'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { Prisma, JournalStatus, ReferenceType } from '@prisma/client';
import { postBulkJournals } from '@/services/accounting/journals-service';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';
import {
    requireFinanceAccess,
    requireFinanceApprover,
} from '@/lib/auth/finance-access';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';

const JOURNAL_SORT_COLUMNS = [
    'entryNumber',
    'entryDate',
    'description',
    'reference',
    'status',
] as const;

export type JournalSortColumn = (typeof JOURNAL_SORT_COLUMNS)[number];
export type JournalSortDirection = 'asc' | 'desc';

export interface JournalFilterParams {
    page?: number;
    limit?: number;
    search?: string;
    startDate?: Date;
    endDate?: Date;
    status?: JournalStatus;
    referenceType?: string;
    sortBy?: JournalSortColumn;
    sortDirection?: JournalSortDirection;
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
    if (!Number.isFinite(value) || value === undefined || value < 1) {
        return fallback;
    }
    return Math.floor(value);
}

function normalizeSort(
    sortBy: JournalFilterParams['sortBy'],
    sortDirection: JournalFilterParams['sortDirection'],
): { sortBy: JournalSortColumn; sortDirection: JournalSortDirection } {
    return {
        sortBy: JOURNAL_SORT_COLUMNS.includes(sortBy as JournalSortColumn)
            ? (sortBy as JournalSortColumn)
            : 'entryDate',
        sortDirection:
            sortDirection === 'asc' || sortDirection === 'desc'
                ? sortDirection
                : 'desc',
    };
}

export const getJournalEntries = withTenant(async function getJournalEntries(
    params: JournalFilterParams = {},
) {
    return safeAction(async () => {
        await requireFinanceAccess();
        const { search, startDate, endDate, status, referenceType } = params;
        const page = normalizePositiveInteger(params.page, 1);
        const limit = Math.min(normalizePositiveInteger(params.limit, 10), 100);
        const { sortBy, sortDirection } = normalizeSort(
            params.sortBy,
            params.sortDirection,
        );

        const where: Prisma.JournalEntryWhereInput = {
            AND: [
                search
                    ? {
                          OR: [
                              {
                                  entryNumber: {
                                      contains: search,
                                      mode: 'insensitive',
                                  },
                              },
                              {
                                  description: {
                                      contains: search,
                                      mode: 'insensitive',
                                  },
                              },
                              {
                                  reference: {
                                      contains: search,
                                      mode: 'insensitive',
                                  },
                              },
                          ],
                      }
                    : {},
                startDate ? { entryDate: { gte: startDate } } : {},
                endDate ? { entryDate: { lte: endDate } } : {},
                status ? { status } : {},
                referenceType
                    ? { referenceType: referenceType as ReferenceType }
                    : {},
            ],
        };

        const total = await prisma.journalEntry.count({ where });
        const totalPages = Math.ceil(total / limit);
        const clampedPage = Math.min(page, Math.max(1, totalPages));
        const data = await prisma.journalEntry.findMany({
            where,
            include: {
                createdBy: { select: { name: true } },
                lines: {
                    take: 2, // Preview first 2 lines
                    include: {
                        account: { select: { code: true, name: true } },
                    },
                },
            },
            orderBy: [{ [sortBy]: sortDirection }, { id: sortDirection }],
            skip: (clampedPage - 1) * limit,
            take: limit,
        });

        return {
            data: data.map((j) => ({
                ...j,
                lines: j.lines.map((l) => ({
                    ...l,
                    debit: Number(l.debit),
                    credit: Number(l.credit),
                    exchangeRate: Number(l.exchangeRate),
                })),
            })),
            meta: {
                total,
                page: clampedPage,
                limit,
                totalPages,
            },
        };
    });
});

export const batchPostJournals = withTenant(async function batchPostJournals(
    ids: string[],
) {
    return safeAction(async () => {
        const session = await requireFinanceApprover();
        try {
            await postBulkJournals(ids, session.user.id);
            revalidatePath('/finance/journals');
            return { message: 'Status batch post success' };
        } catch (error) {
            logger.error('Failed to batch post journals', {
                error,
                module: 'JournalActions',
            });
            throw new BusinessRuleError(
                'Batch posting failed. Please review selected journals.',
            );
        }
    });
});
