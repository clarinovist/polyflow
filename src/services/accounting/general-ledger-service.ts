import { prisma } from '@/lib/core/prisma';
import { Prisma, AccountType } from '@prisma/client';

export interface GeneralLedgerEntry {
    date: Date;
    entryNumber: string;
    description: string;
    reference: string | null;
    referenceType: string | null;
    debit: number;
    credit: number;
    balance: number;
}

export interface GeneralLedgerAccount {
    id: string;
    code: string;
    name: string;
    type: AccountType;
    category: string;
    entries: GeneralLedgerEntry[];
    totalDebit: number;
    totalCredit: number;
    endingBalance: number;
}

export interface GeneralLedgerData {
    accounts: GeneralLedgerAccount[];
    grandTotalDebit: number;
    grandTotalCredit: number;
}

/**
 * Get General Ledger (Buku Besar) — all accounts with their transaction details.
 * Groups POSTED journal lines by account, calculates running balance per account.
 */
export async function getGeneralLedger(
    startDate?: Date,
    endDate?: Date
): Promise<GeneralLedgerData> {
    const entryDate: Prisma.DateTimeFilter = {};
    if (startDate) entryDate.gte = startDate;
    if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        entryDate.lte = endOfDay;
    }

    const where: Prisma.JournalLineWhereInput = {
        journalEntry: {
            status: 'POSTED',
            ...(Object.keys(entryDate).length ? { entryDate } : {})
        }
    };

    // Fetch all journal lines with their entry info, ordered by account then date
    const lines = await prisma.journalLine.findMany({
        where,
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
            },
            account: {
                select: {
                    id: true,
                    code: true,
                    name: true,
                    type: true,
                    category: true
                }
            }
        },
        orderBy: [
            { account: { code: 'asc' } },
            { journalEntry: { entryDate: 'asc' } },
            { journalEntry: { entryNumber: 'asc' } }
        ]
    });

    // Calculate beginning balances for accounts (entries before startDate)
    const beginningBalances = new Map<string, number>();
    if (startDate) {
        const preLines = await prisma.journalLine.findMany({
            where: {
                journalEntry: {
                    status: 'POSTED',
                    entryDate: { lt: startDate }
                }
            },
            include: {
                account: {
                    select: { id: true, type: true }
                }
            }
        });

        for (const line of preLines) {
            const d = Number(line.debit);
            const c = Number(line.credit);
            const isDebitNormal = ['ASSET', 'EXPENSE'].includes(line.account.type);
            const current = beginningBalances.get(line.accountId) || 0;
            beginningBalances.set(
                line.accountId,
                current + (isDebitNormal ? d - c : c - d)
            );
        }
    }

    // Group lines by account
    const accountMap = new Map<string, {
        account: { id: string; code: string; name: string; type: AccountType; category: string };
        entries: GeneralLedgerEntry[];
        totalDebit: number;
        totalCredit: number;
    }>();

    for (const line of lines) {
        const accId = line.accountId;
        if (!accountMap.has(accId)) {
            accountMap.set(accId, {
                account: {
                    id: line.account.id,
                    code: line.account.code,
                    name: line.account.name,
                    type: line.account.type,
                    category: line.account.category
                },
                entries: [],
                totalDebit: 0,
                totalCredit: 0
            });
        }

        const group = accountMap.get(accId)!;
        const debit = Number(line.debit);
        const credit = Number(line.credit);

        // Running balance calculation
        const isDebitNormal = ['ASSET', 'EXPENSE'].includes(line.account.type);
        const lastBalance = group.entries.length > 0
            ? group.entries[group.entries.length - 1].balance
            : (beginningBalances.get(accId) || 0);

        const newBalance = isDebitNormal
            ? lastBalance + debit - credit
            : lastBalance + credit - debit;

        group.entries.push({
            date: line.journalEntry.entryDate,
            entryNumber: line.journalEntry.entryNumber,
            description: line.description || line.journalEntry.description,
            reference: line.journalEntry.reference,
            referenceType: line.journalEntry.referenceType,
            debit,
            credit,
            balance: newBalance
        });

        group.totalDebit += debit;
        group.totalCredit += credit;
    }

    // Build result, sorted by account code
    const accounts: GeneralLedgerAccount[] = Array.from(accountMap.values())
        .sort((a, b) => a.account.code.localeCompare(b.account.code))
        .map(group => ({
            ...group.account,
            entries: group.entries,
            totalDebit: group.totalDebit,
            totalCredit: group.totalCredit,
            endingBalance: group.entries.length > 0
                ? group.entries[group.entries.length - 1].balance
                : (beginningBalances.get(group.account.id) || 0)
        }));

    return {
        accounts,
        grandTotalDebit: accounts.reduce((sum, a) => sum + a.totalDebit, 0),
        grandTotalCredit: accounts.reduce((sum, a) => sum + a.totalCredit, 0)
    };
}
