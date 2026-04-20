import { prisma } from '@/lib/core/prisma';

export async function getAccountByCode(code: string) {
    const account = await prisma.account.findUnique({ where: { code } });
    if (!account) throw new Error(`Account code ${code} not found.`);
    return account;
}

export function getAccountCodeByMethod(method: string): string {
    switch (method.toLowerCase()) {
        case 'cash':
            return '11110';
        case 'check':
        case 'bank transfer':
        case 'credit card':
        default:
            return '11120';
    }
}