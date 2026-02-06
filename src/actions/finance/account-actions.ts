'use server';

import { prisma } from '@/lib/prisma';
import { AccountType, AccountCategory } from '@prisma/client';
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

    // TODO: Add strict validation for code uniqueness if creating new

    if (id) {
        await prisma.account.update({
            where: { id },
            data: rest
        });
    } else {
        // Check if code exists
        const existing = await prisma.account.findUnique({ where: { code: rest.code } });
        if (existing) throw new Error(`Account code ${rest.code} already exists.`);

        await prisma.account.create({
            data: rest
        });
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
            entryDate?: {
                gte?: Date;
                lte?: Date;
            };
        };
    } = {};
    if (startDate || endDate) {
        dateFilter.journalEntry = {};
        if (startDate) {
            dateFilter.journalEntry.entryDate = { gte: startDate };
        }
        if (endDate) {
            if (dateFilter.journalEntry.entryDate) {
                dateFilter.journalEntry.entryDate.lte = endDate;
            } else {
                dateFilter.journalEntry.entryDate = { lte: endDate };
            }
        }
    }

    // Get journal lines for this account
    const lines = await prisma.journalLine.findMany({
        where: {
            accountId,
            ...dateFilter
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
