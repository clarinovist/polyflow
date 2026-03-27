'use server';

import { withTenant } from "@/lib/core/tenant";
import { PettyCashService, CreatePettyCashValues } from '@/services/finance/petty-cash-service';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';
import { revalidatePath } from 'next/cache';

export const getPettyCashTransactions = withTenant(
async function getPettyCashTransactions() {
    return safeAction(async () => {
        await requireAuth();
        const data = await PettyCashService.getTransactions();
        return serializeData(data);
    });
}
);

export const getPettyCashBalance = withTenant(
async function getPettyCashBalance() {
    return safeAction(async () => {
        await requireAuth();
        const balance = await PettyCashService.getBalance();
        return serializeData(balance);
    });
}
);

export const createPettyCashExpense = withTenant(
async function createPettyCashExpense(data: CreatePettyCashValues) {
    return safeAction(async () => {
        const session = await requireAuth();
        const result = await PettyCashService.createExpense(data, session.user.id);
        revalidatePath('/finance/petty-cash');
        return serializeData(result);
    });
}
);

export const approvePettyCashExpense = withTenant(
async function approvePettyCashExpense(id: string) {
    return safeAction(async () => {
        const session = await requireAuth();
        const result = await PettyCashService.approveExpense(id, session.user.id);
        revalidatePath('/finance/petty-cash');
        return serializeData(result);
    });
}
);

export const replenishPettyCash = withTenant(
async function replenishPettyCash(amount: number, bankAccountId: string) {
    return safeAction(async () => {
        const session = await requireAuth();
        const result = await PettyCashService.replenish(amount, bankAccountId, session.user.id);
        revalidatePath('/finance/petty-cash');
        return serializeData(result);
    });
}
);
