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

    const revenueAccounts = accountData.filter(a => a.type === 'REVENUE' || a.code.startsWith('4'));
    const cogsAccounts = accountData.filter(a => a.code.startsWith('5'));
    const opexAccounts = accountData.filter(a => a.code.startsWith('6') || a.code.startsWith('7') || a.code.startsWith('8'));
    const otherRevenueAccounts = accountData.filter(a => a.code.startsWith('8')); // Other Income (8xxxx)
    const otherExpenseAccounts = accountData.filter(a => a.code.startsWith('9')); // Other Expenses (9xxxx)

    const totalRevenue = revenueAccounts.reduce((sum, a) => sum + a.netBalance, 0);
    const totalCOGS = cogsAccounts.reduce((sum, a) => sum + a.netBalance, 0);
    // const grossProfit = totalRevenue - totalCOGS;

    const totalOpEx = opexAccounts.reduce((sum, a) => sum + a.netBalance, 0);
    // const operatingIncome = grossProfit - totalOpEx;

    const totalOtherRevenue = otherRevenueAccounts.reduce((sum, a) => sum + a.netBalance, 0);
    const totalOtherExpense = otherExpenseAccounts.reduce((sum, a) => sum + a.netBalance, 0);

    // Net Income = Operating Income + Other Income - Other Expense
    // Note: Revenue accounts (8xxxx) have positive netBalance if Credit > Debit
    // Note: Expense accounts (9xxxx) have positive netBalance if Debit > Credit
    // So we ADD Other Revenue and SUBTRACT Other Expense.
    // const netIncome = operatingIncome + totalOtherRevenue - totalOtherExpense;

    // --- NEW: Inventory Change Calculation for Mfg COGS ---
    // ... code truncated ...
    const inventoryAccounts = await prisma.account.findMany({
        where: { code: { startsWith: '113' } },
        select: { id: true, code: true, name: true }
    });

    const inventoryChange = await calculateInventoryChange(inventoryAccounts, startDate, endDate);
    const adjustedCOGS = totalCOGS - inventoryChange;
    const adjustedGrossProfit = totalRevenue - adjustedCOGS;
    const adjustedOperatingIncome = adjustedGrossProfit - totalOpEx;
    const adjustedNetIncome = adjustedOperatingIncome + totalOtherRevenue - totalOtherExpense;

    return {
        revenue: revenueAccounts,
        cogs: cogsAccounts,
        opex: opexAccounts,
        other: [...otherRevenueAccounts, ...otherExpenseAccounts], // Merge for display if needed
        totalRevenue,
        totalManufacturingCosts: totalCOGS,
        inventoryChange,
        totalCOGS: adjustedCOGS,
        grossProfit: adjustedGrossProfit,
        totalOpEx,
        operatingIncome: adjustedOperatingIncome,
        totalOther: totalOtherRevenue - totalOtherExpense, // Net Other Income/Expense
        netIncome: adjustedNetIncome
    };
}

async function calculateInventoryChange(accounts: { id: string }[], startDate: Date, endDate: Date) {
    // 1. Get Balances BEFORE Start Date (Beginning Balance)
    const beginningBalances = await prisma.journalLine.aggregate({
        where: {
            accountId: { in: accounts.map(a => a.id) },
            journalEntry: {
                entryDate: { lt: startDate }, // strictly before start
                status: 'POSTED'
            }
        },
        _sum: { debit: true, credit: true }
    });

    // Asset: Debit is positive
    const beginningVal = (Number(beginningBalances._sum.debit) || 0) - (Number(beginningBalances._sum.credit) || 0);

    // 2. Get Balances UP TO End Date (Ending Balance)
    const endingBalances = await prisma.journalLine.aggregate({
        where: {
            accountId: { in: accounts.map(a => a.id) },
            journalEntry: {
                entryDate: { lte: endDate }, // up to end date
                status: 'POSTED'
            }
        },
        _sum: { debit: true, credit: true }
    });

    const endingVal = (Number(endingBalances._sum.debit) || 0) - (Number(endingBalances._sum.credit) || 0);

    return endingVal - beginningVal;
}

export async function getBalanceSheet(asOfDate: Date) {
    const accounts = await prisma.account.findMany({
        where: {
            type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] }
        },
        orderBy: { code: 'asc' },
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
