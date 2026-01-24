import { prisma } from '@/lib/prisma';
import { AccountingService } from '../accounting-service';

export class BudgetService {

    /**
     * Get Budgets for a Year/Month
     */
    static async getBudgets(year: number, month: number) {
        return await prisma.budget.findMany({
            where: { year, month },
            include: { account: true }
        });
    }

    /**
     * Set or Update Budget
     */
    static async setBudget(data: { accountId: string, year: number, month: number, amount: number }) {
        return await prisma.budget.upsert({
            where: {
                accountId_year_month: {
                    accountId: data.accountId,
                    year: data.year,
                    month: data.month
                }
            },
            update: { amount: data.amount },
            create: {
                accountId: data.accountId,
                year: data.year,
                month: data.month,
                amount: data.amount
            }
        });
    }

    /**
     * Get Budget vs Actual Report
     */
    static async getVarianceReport(year: number, month: number) {
        const budgets = await this.getBudgets(year, month);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        const report = [];

        for (const b of budgets) {
            const actual = await AccountingService.getAccountBalance(b.accountId, startDate, endDate);

            // For Balance Sheet accounts, get total balance as of end date
            // For P&L accounts, get period movement
            // getAccountBalance currently returns movement (debit - credit)

            const actualVal = Math.abs(actual); // Simplified for reporting
            const budgetVal = Number(b.amount);
            const variance = actualVal - budgetVal;
            const variancePercent = budgetVal !== 0 ? (variance / budgetVal) * 100 : 0;

            report.push({
                accountCode: b.account.code,
                accountName: b.account.name,
                budget: budgetVal,
                actual: actualVal,
                variance,
                variancePercent
            });
        }

        return report;
    }
}
