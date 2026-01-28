'use server';

import { prisma } from '@/lib/prisma';
import { AccountType, AccountCategory } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function getAccounts() {
    return await prisma.account.findMany({
        orderBy: { code: 'asc' },
        include: {
            parent: {
                select: { code: true, name: true }
            }
        }
    });
}

export type UpsertAccountInput = {
    id?: string;
    code: string;
    name: string;
    type: AccountType;
    category: AccountCategory;
    parentId?: string | null;
    description?: string | null;
    isCashAccount?: boolean;
};

export async function upsertAccount(data: UpsertAccountInput) {
    const { id, ...rest } = data;

    // TODO: Add strict validation for code uniqueness if creating new

    if (id) {
        await prisma.account.update({
            where: { id },
            data: rest
        });
    } else {
        // Check if code exists
        const existing = await prisma.account.findUnique({ where: { code: rest.code } });
        if (existing) throw new Error(`Account code ${rest.code} already exists.`);

        await prisma.account.create({
            data: rest
        });
    }
    revalidatePath('/finance/coa');
    return { success: true };
}

export async function deleteAccount(id: string) {
    // Check for journal entries
    const usageCount = await prisma.journalLine.count({ where: { accountId: id } });
    if (usageCount > 0) {
        throw new Error(`Cannot delete account. It is used in ${usageCount} journal entries.`);
    }

    // Check for child accounts
    const childCount = await prisma.account.count({ where: { parentId: id } });
    if (childCount > 0) {
        throw new Error(`Cannot delete account. Please reassign or delete its ${childCount} sub-accounts first.`);
    }

    await prisma.account.delete({ where: { id } });
    revalidatePath('/finance/coa');
    return { success: true };
}
