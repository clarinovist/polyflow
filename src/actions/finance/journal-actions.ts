'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { Prisma, JournalStatus, ReferenceType } from '@prisma/client';
import { postBulkJournals } from '@/services/accounting/journals-service';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';
import { requireFinanceAccess, requireFinanceApprover } from '@/lib/auth/finance-access';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';

export interface JournalFilterParams {
    page?: number;
    limit?: number;
    search?: string;
    startDate?: Date;
    endDate?: Date;
    status?: JournalStatus;
    referenceType?: string;
}

export const getJournalEntries = withTenant(async function getJournalEntries(
    params: JournalFilterParams,
) {
    return safeAction(async () => {
        await requireFinanceAccess();
        const {
            page = 1,
            limit = 10,
            search,
            startDate,
            endDate,
            status,
            referenceType,
        } = params;

        const skip = (page - 1) * limit;

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

        const [data, total] = await Promise.all([
            prisma.journalEntry.findMany({
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
                orderBy: { entryDate: 'desc' },
                skip,
                take: limit,
            }),
            prisma.journalEntry.count({ where }),
        ]);

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
                page,
                limit,
                totalPages: Math.ceil(total / limit),
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
