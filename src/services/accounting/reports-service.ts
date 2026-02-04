import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function getTrialBalance(startDate?: Date, endDate?: Date) {
    const accounts = await prisma.account.findMany({
        orderBy: { code: 'asc' }
    });

    const where: Prisma.JournalLineWhereInput = {
        journalEntry: {
            status: 'POSTED',
            ...(endDate ? { entryDate: { lte: endDate } } : {})
        }
    };

    const balances = await prisma.journalLine.groupBy({
        by: ['accountId'],
        _sum: {
            debit: true,
            credit: true
        },
        where
    });

    const result = accounts.map(acc => {
        const agg = balances.find(b => b.accountId === acc.id);
        const totalDebit = Number(agg?._sum.debit || 0);
        const totalCredit = Number(agg?._sum.credit || 0);

        let netBalance = 0;
        if (['ASSET', 'EXPENSE'].includes(acc.type)) {
            netBalance = totalDebit - totalCredit;
        } else {
            netBalance = totalCredit - totalDebit;
        }

        return {
            ...acc,
            totalDebit,
            totalCredit,
            netBalance
        };
    });

    return result;
}

export async function getIncomeStatement(startDate: Date, endDate: Date) {
    const accounts = await prisma.account.findMany({
        where: {
            type: { in: ['REVENUE', 'EXPENSE'] }
        },
        include: {
            journalLines: {
                where: {
                    journalEntry: {
                        entryDate: { gte: startDate, lte: endDate },
                        status: 'POSTED'
                    }
                }
            }
        }
    });

    const revenues = accounts.filter(a => a.type === 'REVENUE').map(a => ({
        ...a,
        amount: a.journalLines.reduce((sum, l) => sum + (Number(l.credit) - Number(l.debit)), 0)
    }));

    const expenses = accounts.filter(a => a.type === 'EXPENSE').map(a => ({
        ...a,
        amount: a.journalLines.reduce((sum, l) => sum + (Number(l.debit) - Number(l.credit)), 0)
    }));

    const totalRevenue = revenues.reduce((sum, a) => sum + a.amount, 0);
    const totalExpense = expenses.reduce((sum, a) => sum + a.amount, 0);

    return {
        revenue: revenues,
        expense: expenses,
        totalRevenue,
        totalExpense,
        netIncome: totalRevenue - totalExpense
    };
}

export async function getBalanceSheet(asOfDate: Date) {
    const accounts = await prisma.account.findMany({
        where: {
            type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] }
        },
        include: {
            journalLines: {
                where: {
                    journalEntry: {
                        entryDate: { lte: asOfDate },
                        status: 'POSTED'
                    }
                }
            }
        }
    });

    const assets = accounts.filter(a => a.type === 'ASSET').map(a => ({
        ...a,
        netBalance: a.journalLines.reduce((sum, l) => sum + (Number(l.debit) - Number(l.credit)), 0)
    }));

    const liabilities = accounts.filter(a => a.type === 'LIABILITY').map(a => ({
        ...a,
        netBalance: a.journalLines.reduce((sum, l) => sum + (Number(l.credit) - Number(l.debit)), 0)
    }));

    const equity = accounts.filter(a => a.type === 'EQUITY').map(a => ({
        ...a,
        netBalance: a.journalLines.reduce((sum, l) => sum + (Number(l.credit) - Number(l.debit)), 0)
    }));

    const totalAsset = assets.reduce((sum, a) => sum + a.netBalance, 0);
    const totalLiability = liabilities.reduce((sum, a) => sum + a.netBalance, 0);
    const totalEquity = equity.reduce((sum, a) => sum + a.netBalance, 0);

    const calculatedNetIncome = totalAsset - (totalLiability + totalEquity);

    return {
        assets,
        liabilities,
        equity,
        totalAssets: totalAsset,
        totalLiabilities: totalLiability,
        totalEquity,
        calculatedNetIncome,
        totalLiabilitiesAndEquity: totalLiability + totalEquity + calculatedNetIncome
    };
}

export async function getAccountBalance(accountId: string, startDate?: Date, endDate?: Date) {
    const entryDate: Prisma.DateTimeFilter = {};
    if (startDate) entryDate.gte = startDate;
    if (endDate) entryDate.lte = endDate;

    const where: Prisma.JournalLineWhereInput = {
        accountId,
        journalEntry: {
            status: 'POSTED',
            ...(Object.keys(entryDate).length ? { entryDate } : {})
        }
    };

    const lines = await prisma.journalLine.findMany({
        where,
        include: { journalEntry: true }
    });

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new Error("Account not found");

    const isDebitNormal = ['ASSET', 'EXPENSE'].includes(account.type);

    const balance = lines.reduce((sum, line) => {
        const val = Number(line.debit) - Number(line.credit);
        return sum + (isDebitNormal ? val : -val);
    }, 0);

    return balance;
}
