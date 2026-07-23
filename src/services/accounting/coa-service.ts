import { prisma } from '@/lib/core/prisma';
import { AccountType, AccountCategory } from '@prisma/client';
import { ConflictError, BusinessRuleError } from '@/lib/errors/errors';

export async function getChartOfAccounts() {
    return await prisma.account.findMany({
        orderBy: { code: 'asc' }
    });
}

export async function createAccount(data: { code: string; name: string; type: AccountType; category: AccountCategory; description?: string }) {
    const existing = await prisma.account.findUnique({ where: { code: data.code } });
    if (existing) throw new ConflictError(`Kode akun ${data.code} sudah ada`, { code: data.code, existingAccountId: existing.id });

    return await prisma.account.create({ data });
}

export async function updateAccount(id: string, data: { code?: string; name?: string; type?: AccountType; category?: AccountCategory; description?: string }) {
    if (data.code) {
        const existing = await prisma.account.findUnique({ where: { code: data.code } });
        if (existing && existing.id !== id) throw new ConflictError(`Kode akun ${data.code} sudah ada`, { code: data.code, existingAccountId: existing.id });
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
        throw new BusinessRuleError("Tidak dapat menghapus akun karena masih memiliki transaksi. Pertimbangkan untuk menonaktifkannya saja.", { accountId: id, journalLineCount: 1 });
    }

    return await prisma.account.delete({
        where: { id }
    });
}
