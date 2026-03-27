'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma as db } from '@/lib/core/prisma'; // Ensure consistent import
import { BudgetFormValues, budgetSchema } from '@/lib/schemas/finance';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError, ValidationError } from '@/lib/errors/errors';

export const getBudgets = withTenant(
async function getBudgets(year: number) {
    return safeAction(async () => {
        try {
            const budgets = await db.budget.findMany({
                where: { year },
                include: {
                    account: true
                }
            });
            return budgets.map(b => ({
                ...b,
                amount: Number(b.amount)
            }));
        } catch (error) {
            logger.error('Failed to fetch budgets', { error, year, module: 'BudgetActions' });
            throw new BusinessRuleError('Failed to fetch budgets. Please try again later.');
        }
    });
}
);

export const upsertBudget = withTenant(
async function upsertBudget(data: BudgetFormValues) {
    return safeAction(async () => {
        try {
            const result = budgetSchema.safeParse(data);
            if (!result.success) {
                throw new ValidationError(result.error.issues[0].message);
            }
            const validated = result.data;

            // Check if exists
            const existing = await db.budget.findFirst({
                where: {
                    accountId: validated.accountId,
                    year: validated.year,
                    month: validated.month
                }
            });

            if (existing) {
                await db.budget.update({
                    where: { id: existing.id },
                    data: {
                        amount: validated.amount
                    }
                });
            } else {
                await db.budget.create({
                    data: {
                        accountId: validated.accountId,
                        year: validated.year,
                        month: validated.month,
                        amount: validated.amount
                    }
                });
            }

            revalidatePath('/finance/budget');
        } catch (error) {
            if (error instanceof ValidationError) throw error;
            logger.error('Failed to save budget', { error, module: 'BudgetActions' });
            throw new BusinessRuleError('Failed to save budget. Please check input.');
        }
    });
}
);
