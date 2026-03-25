'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma as db } from '@/lib/core/prisma'; // Ensure consistent import
import { BudgetFormValues, budgetSchema } from '@/lib/schemas/finance';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';

export const getBudgets = withTenant(
async function getBudgets(year: number) {
    try {
        const budgets = await db.budget.findMany({
            where: { year },
            include: {
                account: true
            }
        });
        return {
            success: true,
            data: budgets.map(b => ({
                ...b,
                amount: Number(b.amount)
            }))
        };
    } catch (error) {
        logger.error('Failed to fetch budgets', { error, year, module: 'BudgetActions' });
        return { success: false, error: 'Failed to fetch budgets. Please try again later.' };
    }
}
);

export const upsertBudget = withTenant(
async function upsertBudget(data: BudgetFormValues) {
    try {
        const validated = budgetSchema.parse(data);

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
        return { success: true };
    } catch (error) {
        logger.error('Failed to save budget', { error, module: 'BudgetActions' });
        return { success: false, error: 'Failed to save budget. Please check input.' };
    }
}
);
