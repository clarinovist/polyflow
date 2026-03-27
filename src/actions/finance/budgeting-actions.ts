'use server';

import { withTenant } from "@/lib/core/tenant";
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';
import { prisma } from '@/lib/core/prisma';

export const getBudgetVsActuals = withTenant(
async function getBudgetVsActuals(year: number, month: number) {
    return safeAction(async () => {
        await requireAuth();

        // Get all budgets for the given year/month
        const budgets = await prisma.budget.findMany({
            where: { year, month },
            include: {
                account: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        category: true,
                    }
                }
            }
        });

        // Get all actual balances for those accounts in the same period
        const results = await Promise.all(budgets.map(async (b) => {
            // Actual is calculated by summing journal lines for that month.

            const firstDay = new Date(year, month - 1, 1);
            const nextMonthDay = new Date(year, month, 1);

            const lines = await prisma.journalLine.findMany({
                where: {
                    accountId: b.accountId,
                    journalEntry: {
                        status: 'POSTED',
                        entryDate: {
                            gte: firstDay,
                            lt: nextMonthDay
                        }
                    }
                }
            });

            const totalDebit = lines.reduce((acc, curr) => acc + (curr.debit ? curr.debit.toNumber() : 0), 0);
            const totalCredit = lines.reduce((acc, curr) => acc + (curr.credit ? curr.credit.toNumber() : 0), 0);
            
            // Depending on account type. Expense: Debit is positive. Revenue: Credit is positive.
            let actualAmount = 0;
            if (b.account.category.includes('EXPENSE')) actualAmount = totalDebit - totalCredit;
            else if (b.account.category.includes('REVENUE')) actualAmount = totalCredit - totalDebit;
            else actualAmount = totalDebit - totalCredit; // fallback for Assets

            return {
                id: b.id,
                accountCode: b.account.code,
                accountName: b.account.name,
                category: b.account.category,
                budgetAmount: b.amount.toNumber(),
                actualAmount: actualAmount,
                variance: b.amount.toNumber() - actualAmount,
                variancePercentage: b.amount.toNumber() === 0 ? 0 : ((b.amount.toNumber() - actualAmount) / b.amount.toNumber()) * 100
            };
        }));

        return serializeData(results);
    });
}
);
