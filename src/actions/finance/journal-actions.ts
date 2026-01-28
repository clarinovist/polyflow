'use server';

import { prisma } from '@/lib/prisma';
import { Prisma, JournalStatus } from '@prisma/client';

export interface JournalFilterParams {
    page?: number;
    limit?: number;
    search?: string;
    startDate?: Date;
    endDate?: Date;
    status?: JournalStatus;
    referenceType?: string;
}

export async function getJournalEntries(params: JournalFilterParams) {
    const {
        page = 1,
        limit = 10,
        search,
        startDate,
        endDate,
        status,
        referenceType
    } = params;

    const skip = (page - 1) * limit;

    const where: Prisma.JournalEntryWhereInput = {
        AND: [
            search ? {
                OR: [
                    { entryNumber: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                    { reference: { contains: search, mode: 'insensitive' } }
                ]
            } : {},
            startDate ? { entryDate: { gte: startDate } } : {},
            endDate ? { entryDate: { lte: endDate } } : {},
            status ? { status } : {},
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            referenceType ? { referenceType: referenceType as any } : {}
        ]
    };

    const [data, total] = await Promise.all([
        prisma.journalEntry.findMany({
            where,
            include: {
                createdBy: { select: { name: true } },
                lines: {
                    take: 2, // Preview first 2 lines
                    include: { account: { select: { code: true, name: true } } }
                }
            },
            orderBy: { entryDate: 'desc' },
            skip,
            take: limit
        }),
        prisma.journalEntry.count({ where })
    ]);


    return {
        data: data.map(j => ({
            ...j,
            lines: j.lines.map(l => ({
                ...l,
                debit: Number(l.debit),
                credit: Number(l.credit),
                exchangeRate: Number(l.exchangeRate)
            }))
        })),
        meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    };
}
