import { prisma } from '@/lib/core/prisma';
import { Prisma, AccountType } from '@prisma/client';
import { wibRangeBounds } from '@/lib/utils/timezone';

interface GeneralLedgerEntry {
    date: Date;
    entryNumber: string;
    description: string;
    reference: string | null;
    referenceType: string | null;
    debit: number;
    credit: number;
    balance: number;
}

interface GeneralLedgerAccount {
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

/** One row of the account-level summary (no transaction lines). */
export interface GeneralLedgerSummaryAccount {
    id: string;
    code: string;
    name: string;
    type: AccountType;
    category: string;
    entryCount: number;
    beginningBalance: number;
    totalDebit: number;
    totalCredit: number;
    endingBalance: number;
}

export interface GeneralLedgerSummary {
    accounts: GeneralLedgerSummaryAccount[];
    grandTotalDebit: number;
    grandTotalCredit: number;
}

/** Transaction lines for ONE account, fetched on demand (drill-down). */
export interface GeneralLedgerAccountDetail {
    accountId: string;
    beginningBalance: number;
    entries: GeneralLedgerEntry[];
    totalDebit: number;
    totalCredit: number;
    endingBalance: number;
}

/** Accounts whose balance grows on the debit side. */
function isDebitNormalType(type: AccountType | string): boolean {
    return type === 'ASSET' || type === 'EXPENSE';
}

/** Signed movement of a line for the given account nature. */
function signedMovement(
    debit: number,
    credit: number,
    debitNormal: boolean,
): number {
    return debitNormal ? debit - credit : credit - debit;
}

/**
 * Sum posted movement per account strictly BEFORE `rangeStart`.
 * Aggregated in the database — never hydrates the underlying lines.
 */
async function getBeginningBalances(
    accountIds: string[],
    rangeStart: Date | undefined,
    accountTypeById: Map<string, AccountType>,
): Promise<Map<string, number>> {
    const balances = new Map<string, number>();
    if (!rangeStart || accountIds.length === 0) return balances;

    const grouped = await prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
            accountId: { in: accountIds },
            journalEntry: {
                status: 'POSTED',
                entryDate: { lt: rangeStart },
            },
        },
        _sum: { debit: true, credit: true },
    });

    for (const row of grouped) {
        const type = accountTypeById.get(row.accountId);
        if (!type) continue;
        balances.set(
            row.accountId,
            signedMovement(
                Number(row._sum.debit ?? 0),
                Number(row._sum.credit ?? 0),
                isDebitNormalType(type),
            ),
        );
    }

    return balances;
}

/**
 * Account-level General Ledger summary — one row per account that has activity
 * in the range. Totals are aggregated in the database, so the payload stays
 * proportional to the number of accounts (tens) instead of journal lines
 * (tens of thousands). Use `getGeneralLedgerAccountEntries` to drill into one
 * account's transactions.
 */
export async function getGeneralLedgerSummary(
    startDate?: Date,
    endDate?: Date,
): Promise<GeneralLedgerSummary> {
    const bounds = wibRangeBounds(startDate, endDate);
    const rangeStart = bounds.gte;
    const entryDate: Prisma.DateTimeFilter = { ...bounds };

    const grouped = await prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
            journalEntry: {
                status: 'POSTED',
                ...(Object.keys(entryDate).length ? { entryDate } : {}),
            },
        },
        _sum: { debit: true, credit: true },
        _count: { _all: true },
    });

    if (grouped.length === 0) {
        return { accounts: [], grandTotalDebit: 0, grandTotalCredit: 0 };
    }

    const accountIds = grouped.map((g) => g.accountId);
    const accounts = await prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: {
            id: true,
            code: true,
            name: true,
            type: true,
            category: true,
        },
    });

    const accountTypeById = new Map<string, AccountType>(
        accounts.map((a) => [a.id, a.type]),
    );
    const beginningBalances = await getBeginningBalances(
        accountIds,
        rangeStart,
        accountTypeById,
    );

    const groupedById = new Map(grouped.map((g) => [g.accountId, g]));

    const rows: GeneralLedgerSummaryAccount[] = accounts.map((account) => {
        const agg = groupedById.get(account.id);
        const totalDebit = Number(agg?._sum.debit ?? 0);
        const totalCredit = Number(agg?._sum.credit ?? 0);
        const beginningBalance = beginningBalances.get(account.id) ?? 0;

        return {
            id: account.id,
            code: account.code,
            name: account.name,
            type: account.type,
            category: account.category,
            entryCount: agg?._count._all ?? 0,
            beginningBalance,
            totalDebit,
            totalCredit,
            endingBalance:
                beginningBalance +
                signedMovement(
                    totalDebit,
                    totalCredit,
                    isDebitNormalType(account.type),
                ),
        };
    });

    rows.sort((a, b) => a.code.localeCompare(b.code));

    return {
        accounts: rows,
        grandTotalDebit: rows.reduce((sum, a) => sum + a.totalDebit, 0),
        grandTotalCredit: rows.reduce((sum, a) => sum + a.totalCredit, 0),
    };
}

/**
 * Transaction lines for a SINGLE account, with running balance seeded from the
 * pre-range beginning balance. Drill-down companion to
 * `getGeneralLedgerSummary`.
 */
export async function getGeneralLedgerAccountEntries(
    accountId: string,
    startDate?: Date,
    endDate?: Date,
): Promise<GeneralLedgerAccountDetail> {
    const bounds = wibRangeBounds(startDate, endDate);
    const rangeStart = bounds.gte;
    const entryDate: Prisma.DateTimeFilter = { ...bounds };

    const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { id: true, type: true },
    });

    const empty: GeneralLedgerAccountDetail = {
        accountId,
        beginningBalance: 0,
        entries: [],
        totalDebit: 0,
        totalCredit: 0,
        endingBalance: 0,
    };

    if (!account) return empty;

    const debitNormal = isDebitNormalType(account.type);
    const beginningBalances = await getBeginningBalances(
        [accountId],
        rangeStart,
        new Map([[accountId, account.type]]),
    );
    const beginningBalance = beginningBalances.get(accountId) ?? 0;

    const lines = await prisma.journalLine.findMany({
        where: {
            accountId,
            journalEntry: {
                status: 'POSTED',
                ...(Object.keys(entryDate).length ? { entryDate } : {}),
            },
        },
        include: {
            journalEntry: {
                select: {
                    id: true,
                    entryNumber: true,
                    entryDate: true,
                    description: true,
                    reference: true,
                    referenceType: true,
                },
            },
        },
        orderBy: [
            { journalEntry: { entryDate: 'asc' } },
            { journalEntry: { entryNumber: 'asc' } },
        ],
    });

    let balance = beginningBalance;
    let totalDebit = 0;
    let totalCredit = 0;

    const entries: GeneralLedgerEntry[] = lines.map((line) => {
        const debit = Number(line.debit);
        const credit = Number(line.credit);
        balance += signedMovement(debit, credit, debitNormal);
        totalDebit += debit;
        totalCredit += credit;

        return {
            date: line.journalEntry.entryDate,
            entryNumber: line.journalEntry.entryNumber,
            description: line.description || line.journalEntry.description,
            reference: line.journalEntry.reference,
            referenceType: line.journalEntry.referenceType,
            debit,
            credit,
            balance,
        };
    });

    return {
        accountId,
        beginningBalance,
        entries,
        totalDebit,
        totalCredit,
        endingBalance: balance,
    };
}

/**
 * Get General Ledger (Buku Besar) — all accounts with their transaction details.
 * Groups POSTED journal lines by account, calculates running balance per account.
 */
export async function getGeneralLedger(
    startDate?: Date,
    endDate?: Date,
): Promise<GeneralLedgerData> {
    // Interpret the incoming date range as WIB business days. Using WIB bounds
    // keeps GL filtering consistent with how entryDate is stored (WIB-midnight
    // UTC) and avoids server-timezone drift from setHours().
    const bounds = wibRangeBounds(startDate, endDate);
    const rangeStart = bounds.gte;
    const entryDate: Prisma.DateTimeFilter = { ...bounds };

    const where: Prisma.JournalLineWhereInput = {
        journalEntry: {
            status: 'POSTED',
            ...(Object.keys(entryDate).length ? { entryDate } : {}),
        },
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
                    referenceType: true,
                },
            },
            account: {
                select: {
                    id: true,
                    code: true,
                    name: true,
                    type: true,
                    category: true,
                },
            },
        },
        orderBy: [
            { account: { code: 'asc' } },
            { journalEntry: { entryDate: 'asc' } },
            { journalEntry: { entryNumber: 'asc' } },
        ],
    });

    // Collect account IDs that have activity in the date range
    const relevantAccountIds = new Set<string>();
    for (const line of lines) {
        relevantAccountIds.add(line.accountId);
    }

    // Calculate beginning balances only for relevant accounts (optimization)
    const beginningBalances = new Map<string, number>();
    if (rangeStart && relevantAccountIds.size > 0) {
        const preLines = await prisma.journalLine.findMany({
            where: {
                accountId: { in: Array.from(relevantAccountIds) },
                journalEntry: {
                    status: 'POSTED',
                    entryDate: { lt: rangeStart },
                },
            },
            include: {
                account: {
                    select: { id: true, type: true },
                },
            },
        });

        for (const line of preLines) {
            const d = Number(line.debit);
            const c = Number(line.credit);
            const isDebitNormal = ['ASSET', 'EXPENSE'].includes(
                line.account.type,
            );
            const current = beginningBalances.get(line.accountId) || 0;
            beginningBalances.set(
                line.accountId,
                current + (isDebitNormal ? d - c : c - d),
            );
        }
    }

    // Group lines by account
    const accountMap = new Map<
        string,
        {
            account: {
                id: string;
                code: string;
                name: string;
                type: AccountType;
                category: string;
            };
            entries: GeneralLedgerEntry[];
            totalDebit: number;
            totalCredit: number;
        }
    >();

    for (const line of lines) {
        const accId = line.accountId;
        if (!accountMap.has(accId)) {
            accountMap.set(accId, {
                account: {
                    id: line.account.id,
                    code: line.account.code,
                    name: line.account.name,
                    type: line.account.type,
                    category: line.account.category,
                },
                entries: [],
                totalDebit: 0,
                totalCredit: 0,
            });
        }

        const group = accountMap.get(accId)!;
        const debit = Number(line.debit);
        const credit = Number(line.credit);

        // Running balance calculation
        const isDebitNormal = ['ASSET', 'EXPENSE'].includes(line.account.type);
        const lastBalance =
            group.entries.length > 0
                ? group.entries[group.entries.length - 1].balance
                : beginningBalances.get(accId) || 0;

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
            balance: newBalance,
        });

        group.totalDebit += debit;
        group.totalCredit += credit;
    }

    // Build result, sorted by account code
    const accounts: GeneralLedgerAccount[] = Array.from(accountMap.values())
        .sort((a, b) => a.account.code.localeCompare(b.account.code))
        .map((group) => ({
            ...group.account,
            entries: group.entries,
            totalDebit: group.totalDebit,
            totalCredit: group.totalCredit,
            endingBalance:
                group.entries.length > 0
                    ? group.entries[group.entries.length - 1].balance
                    : beginningBalances.get(group.account.id) || 0,
        }));

    return {
        accounts,
        grandTotalDebit: accounts.reduce((sum, a) => sum + a.totalDebit, 0),
        grandTotalCredit: accounts.reduce((sum, a) => sum + a.totalCredit, 0),
    };
}
