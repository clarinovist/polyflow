'use server';

import { prisma } from '@/lib/prisma';
import { AccountType, AccountCategory, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function getAccounts() {
    return await prisma.account.findMany({
        orderBy: { code: 'asc' },
        include: {
            parent: {
                select: { code: true, name: true }
            }
        }
    });
}

export type UpsertAccountInput = {
    id?: string;
    code: string;
    name: string;
    type: AccountType;
    category: AccountCategory;
    parentId?: string | null;
    description?: string | null;
    isCashAccount?: boolean;
};

export async function upsertAccount(data: UpsertAccountInput) {
    const { id, ...rest } = data;

    try {
        if (id) {
            await prisma.account.update({
                where: { id },
                data: rest
            });
        } else {
            await prisma.account.create({
                data: rest
            });
        }
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            // P2002 is the error code for unique constraint violation
            if (error.code === 'P2002') {
                throw new Error(`Account code ${rest.code} already exists.`);
            }
        }
        throw error;
    }

    revalidatePath('/finance/coa');
    return { success: true };
}

export async function deleteAccount(id: string) {
    // Check for journal entries
    const usageCount = await prisma.journalLine.count({ where: { accountId: id } });
    if (usageCount > 0) {
        throw new Error(`Cannot delete account. It is used in ${usageCount} journal entries.`);
    }

    // Check for child accounts
    const childCount = await prisma.account.count({ where: { parentId: id } });
    if (childCount > 0) {
        throw new Error(`Cannot delete account. Please reassign or delete its ${childCount} sub-accounts first.`);
    }

    await prisma.account.delete({ where: { id } });
    revalidatePath('/finance/coa');
    return { success: true };
}

export async function getAccountLedger(
    accountId: string,
    startDate?: Date,
    endDate?: Date
) {
    // Get account details
    const account = await prisma.account.findUnique({
        where: { id: accountId },
        include: {
            parent: {
                select: { code: true, name: true }
            }
        }
    });

    if (!account) {
        throw new Error('Account not found');
    }

    // Build date filter
    const dateFilter: {
        journalEntry?: {
            status?: 'POSTED';
            entryDate?: {
                gte?: Date;
                lte?: Date;
            };
        };
    } = {
        journalEntry: {
            status: 'POSTED'
        }
    };
    if (startDate || endDate) {
        if (startDate) {
            dateFilter.journalEntry!.entryDate = { gte: startDate };
        }
        if (endDate) {
            if (dateFilter.journalEntry!.entryDate) {
                dateFilter.journalEntry!.entryDate.lte = endDate;
            } else {
                dateFilter.journalEntry!.entryDate = { lte: endDate };
            }
        }
    }

    // Get journal lines for this account
    const lines = await prisma.journalLine.findMany({
        where: {
            accountId,
            journalEntry: {
                status: 'POSTED',
                ...(dateFilter.journalEntry?.entryDate ? { entryDate: dateFilter.journalEntry.entryDate } : {})
            }
        },
        include: {
            journalEntry: {
                select: {
                    id: true,
                    entryNumber: true,
                    entryDate: true,
                    description: true,
                    reference: true,
                    referenceType: true
                }
            }
        },
        orderBy: [
            { journalEntry: { entryDate: 'asc' } },
            { journalEntry: { entryNumber: 'asc' } }
        ]
    });

    // Calculate beginning balance (all entries before startDate)
    let beginningBalance = 0;
    if (startDate) {
        const preLines = await prisma.journalLine.findMany({
            where: {
                accountId,
                journalEntry: {
                    status: 'POSTED',
                    entryDate: { lt: startDate }
                }
            }
        });

        preLines.forEach(line => {
            const d = Number(line.debit);
            const c = Number(line.credit);
            if (account.type === 'ASSET' || account.type === 'EXPENSE') {
                beginningBalance += d - c;
            } else {
                beginningBalance += c - d;
            }
        });
    }

    // Calculate running balance starting from beginning balance
    let runningBalance = beginningBalance;
    const ledgerEntries = lines.map(line => {
        const debit = Number(line.debit);
        const credit = Number(line.credit);

        // For asset and expense accounts: debit increases, credit decreases
        // For liability, equity, and revenue: credit increases, debit decreases
        if (account.type === 'ASSET' || account.type === 'EXPENSE') {
            runningBalance += debit - credit;
        } else {
            runningBalance += credit - debit;
        }

        return {
            id: line.id,
            date: line.journalEntry.entryDate,
            entryNumber: line.journalEntry.entryNumber,
            description: line.description || line.journalEntry.description,
            reference: line.journalEntry.reference,
            referenceType: line.journalEntry.referenceType,
            debit,
            credit,
            balance: runningBalance
        };
    });

    return {
        account: {
            id: account.id,
            code: account.code,
            name: account.name,
            type: account.type,
            category: account.category,
            parent: account.parent
        },
        entries: ledgerEntries,
        summary: {
            beginningBalance,
            totalDebit: ledgerEntries.reduce((sum, e) => sum + e.debit, 0),
            totalCredit: ledgerEntries.reduce((sum, e) => sum + e.credit, 0),
            endingBalance: runningBalance
        }
    };
}
