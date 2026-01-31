import { prisma } from '@/lib/prisma';
import { AccountType, AccountCategory } from '@prisma/client';

export async function getChartOfAccounts() {
    return await prisma.account.findMany({
        orderBy: { code: 'asc' }
    });
}

export async function createAccount(data: { code: string; name: string; type: AccountType; category: AccountCategory; description?: string }) {
    const existing = await prisma.account.findUnique({ where: { code: data.code } });
    if (existing) throw new Error(`Account code ${data.code} already exists`);

    return await prisma.account.create({ data });
}

export async function updateAccount(id: string, data: { code?: string; name?: string; type?: AccountType; category?: AccountCategory; description?: string }) {
    if (data.code) {
        const existing = await prisma.account.findUnique({ where: { code: data.code } });
        if (existing && existing.id !== id) throw new Error(`Account code ${data.code} already exists`);
    }

    return await prisma.account.update({
        where: { id },
        data
    });
}

export async function deleteAccount(id: string) {
    const hasLines = await prisma.journalLine.findFirst({
        where: { accountId: id }
    });

    if (hasLines) {
        throw new Error("Cannot delete account because it has existing transactions. Consider deactivating it instead.");
    }

    return await prisma.account.delete({
        where: { id }
    });
}
