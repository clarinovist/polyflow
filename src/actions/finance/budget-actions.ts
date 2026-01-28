'use server';

import { prisma as db } from '@/lib/prisma'; // Ensure consistent import
import { BudgetFormValues, budgetSchema } from '@/lib/schemas/finance';
import { revalidatePath } from 'next/cache';

export async function getBudgets(year: number) {
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
        console.error('Error fetching budgets:', error);
        return { success: false, error: 'Failed to fetch budgets' };
    }
}

export async function upsertBudget(data: BudgetFormValues) {
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
        console.error('Error saving budget:', error);
        return { success: false, error: 'Failed to save budget' };
    }
}
