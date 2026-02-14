import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function getTrialBalance(startDate?: Date, endDate?: Date) {
    const accounts = await prisma.account.findMany({
        orderBy: { code: 'asc' }
    });

    const entryDate: Prisma.DateTimeFilter = {};
    if (startDate) entryDate.gte = startDate;
    if (endDate) entryDate.lte = endDate;

    const where: Prisma.JournalLineWhereInput = {
        journalEntry: {
            status: 'POSTED',
            ...(Object.keys(entryDate).length ? { entryDate } : {})
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
        const debit = Number(agg?._sum.debit || 0);
        const credit = Number(agg?._sum.credit || 0);

        let netBalance = 0;
        if (['ASSET', 'EXPENSE'].includes(acc.type)) {
            netBalance = debit - credit;
        } else {
            netBalance = credit - debit;
        }

        return {
            ...acc,
            debit,
            credit,
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
        orderBy: { code: 'asc' },
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

    const accountData = accounts.map(a => {
        const isRevenue = a.type === 'REVENUE';
        const netBalance = a.journalLines.reduce((sum, l) => {
            const val = Number(l.credit) - Number(l.debit);
            return sum + (isRevenue ? val : -val);
        }, 0);
        return {
            id: a.id,
            code: a.code,
            name: a.name,
            type: a.type,
            netBalance
        };
    });

    // Correct Account Classification
    const revenueAccounts = accountData.filter(a =>
        (a.type === 'REVENUE' || a.code.startsWith('4')) &&
        !a.code.startsWith('8')
    );
    const cogsAccounts = accountData.filter(a => a.code.startsWith('5'));

    // OpEx should NOT include 8xxxx (Other Rev) or 9xxxx (Other Exp)
    const opexAccounts = accountData.filter(a =>
        (a.code.startsWith('6') || a.code.startsWith('7')) &&
        !a.code.startsWith('8') &&
        !a.code.startsWith('9')
    );

    const otherRevenueAccounts = accountData.filter(a => a.code.startsWith('8')); // Other Income (8xxxx)
    const otherExpenseAccounts = accountData.filter(a => a.code.startsWith('9')); // Other Expenses (9xxxx)

    const totalRevenue = revenueAccounts.reduce((sum, a) => sum + a.netBalance, 0);
    const totalCOGS = cogsAccounts.reduce((sum, a) => sum + a.netBalance, 0);
    const grossProfit = totalRevenue - totalCOGS;

    const totalOpEx = opexAccounts.reduce((sum, a) => sum + a.netBalance, 0);
    const operatingIncome = grossProfit - totalOpEx;

    const totalOtherRevenue = otherRevenueAccounts.reduce((sum, a) => sum + a.netBalance, 0);
    const totalOtherExpense = otherExpenseAccounts.reduce((sum, a) => sum + a.netBalance, 0);

    // Net Other Income/Expense
    // Revenue accounts (8xxxx) are Credit normal (positive netBalance in our logic if Credit > Debit)
    // Expense accounts (9xxxx) are Debit normal (positive netBalance if Debit > Credit)
    // But our reduce logic above:
    // const netBalance = a.journalLines.reduce((sum, l) => {
    //    const val = Number(l.credit) - Number(l.debit);
    //    return sum + (isRevenue ? val : -val); 
    // }, 0);

    // Check if 8xxxx and 9xxxx are marked as REVENUE or EXPENSE in DB.
    // Usually 8xxxx is REVENUE type, 9xxxx is EXPENSE type.
    // If so, our netBalance logic handled the sign correct for "Value".
    // So we add Revenue, subtract Expense.

    const totalOther = totalOtherRevenue - totalOtherExpense;
    const netIncome = operatingIncome + totalOther;

    return {
        revenue: revenueAccounts,
        cogs: cogsAccounts,
        opex: opexAccounts,
        other: [...otherRevenueAccounts, ...otherExpenseAccounts],
        totalRevenue,
        totalManufacturingCosts: totalCOGS,
        inventoryChange: 0, // Deprecated for Perpetual
        totalCOGS: totalCOGS,
        grossProfit,
        totalOpEx,
        operatingIncome,
        totalOther,
        netIncome
    };
}

export async function getBalanceSheet(asOfDate: Date) {
    // Ensure we include everything up to the very end of the selected day
    const endOfDay = new Date(asOfDate);
    endOfDay.setHours(23, 59, 59, 999);

    const accounts = await prisma.account.findMany({
        where: {
            type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] }
        },
        orderBy: { code: 'asc' },
        include: {
            journalLines: {
                where: {
                    journalEntry: {
                        entryDate: { lte: endOfDay },
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

export async function getClosingBalances(startDate: Date, endDate: Date) {
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

    return accounts.map(a => {
        const isRevenue = a.type === 'REVENUE';
        const netBalance = a.journalLines.reduce((sum, l) => {
            const val = Number(l.credit) - Number(l.debit);
            return sum + (isRevenue ? val : -val);
        }, 0);

        return {
            id: a.id,
            type: a.type,
            netBalance
        };
    }).filter(a => Math.abs(a.netBalance) > 0.01);
}
