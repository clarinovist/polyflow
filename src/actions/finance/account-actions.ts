'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { AccountType, AccountCategory, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { safeAction, BusinessRuleError, NotFoundError } from '@/lib/errors/errors';

export const getAccounts = withTenant(
async function getAccounts() {
    return safeAction(async () => {
        return await prisma.account.findMany({
            orderBy: { code: 'asc' },
            include: {
                parent: {
                    select: { code: true, name: true }
                }
            }
        });
    });
}
);

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

const GHOST_BLOCKLIST = new Set([
    '11110', '11300', '11310', '11340', '11350', '21200', '30000', '51100', '80000', '81000', '81100', '90000', '91000', '91100',
    '11000', '11100', '11210', '11290', '11400', '11410', '12000', '12100', '12110', '12120', '12190', '12200', '12290', '12300', '12390',
    '21000', '21100', '21110', '21120', '21200', '21300', '21310', '21320', '21330', '21400', '22000', '22100',
    '31000', '32000', '33000', '41000', '41100', '41200', '41900', '50000', '51000', '51200', '52000', '52100', '52200', '53000', '53100', '53200', '53300', '53400', '53410',
    '60000', '61000', '61100', '61200', '62000', '62100', '62200', '62300', '62400',
]);

export const upsertAccount = withTenant(
async function upsertAccount(data: UpsertAccountInput) {
    return safeAction(async () => {
        const { id, ...rest } = data;

        // Hardening: block Kiyowo 5-digit codes in Melindo tenant
        // ponytail: minimal guard; upgrade path: tenant-aware COA format config in AppSetting
        if (!id && GHOST_BLOCKLIST.has(rest.code)) {
            // Check if tenant is melindo by presence of melindo-style accounts
            const melindoMarker = await prisma.account.findFirst({
                where: { code: { startsWith: '1-' } },
                select: { id: true },
            });
            if (melindoMarker) {
                throw new BusinessRuleError(
                    `Kode akun ${rest.code} adalah format Kiyowo dan tidak diperbolehnya di tenant Melindo. Gunakan format X-XXX (misal 1-130, 7-101). ` +
                    `Jika ini migrasi, hubungi admin.`,
                    { code: rest.code },
                );
            }
        }

        try {
            if (id) {
                await prisma.account.update({
                    where: { id },
                    data: rest
                });
            } else {
                await prisma.account.create({
                    data: rest
                });
            }
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                // P2002 is the error code for unique constraint violation
                if (error.code === 'P2002') {
                    throw new BusinessRuleError(`Account code ${rest.code} already exists.`);
                }
            }
            throw error;
        }

        revalidatePath('/finance/coa');
    });
}
);

export const deleteAccount = withTenant(
async function deleteAccount(id: string) {
    return safeAction(async () => {
        // Check for journal entries
        const usageCount = await prisma.journalLine.count({ where: { accountId: id } });
        if (usageCount > 0) {
            throw new BusinessRuleError(`Cannot delete account. It is used in ${usageCount} journal entries.`);
        }

        // Check for child accounts
        const childCount = await prisma.account.count({ where: { parentId: id } });
        if (childCount > 0) {
            throw new BusinessRuleError(`Cannot delete account. Please reassign or delete its ${childCount} sub-accounts first.`);
        }

        await prisma.account.delete({ where: { id } });
        revalidatePath('/finance/coa');
    });
}
);

export const getAccountLedger = withTenant(
async function getAccountLedger(
    accountId: string,
    startDate?: Date,
    endDate?: Date
) {
    return safeAction(async () => {
        // Get account details
        const account = await prisma.account.findUnique({
            where: { id: accountId },
            include: {
                parent: {
                    select: { code: true, name: true }
                }
            }
        });

        if (!account) {
            throw new NotFoundError('Account', accountId);
        }

        // Build date filter
        const dateFilter: {
            journalEntry?: {
                status?: 'POSTED';
                entryDate?: {
                    gte?: Date;
                    lte?: Date;
                };
            };
        } = {
            journalEntry: {
                status: 'POSTED'
            }
        };
        if (startDate || endDate) {
            if (startDate) {
                dateFilter.journalEntry!.entryDate = { gte: startDate };
            }
            if (endDate) {
                if (dateFilter.journalEntry!.entryDate) {
                    dateFilter.journalEntry!.entryDate.lte = endDate;
                } else {
                    dateFilter.journalEntry!.entryDate = { lte: endDate };
                }
            }
        }

        // Get journal lines for this account
        const lines = await prisma.journalLine.findMany({
            where: {
                accountId,
                journalEntry: {
                    status: 'POSTED',
                    ...(dateFilter.journalEntry?.entryDate ? { entryDate: dateFilter.journalEntry.entryDate } : {})
                }
            },
            include: {
                journalEntry: {
                    select: {
                        id: true,
                        entryNumber: true,
                        entryDate: true,
                        description: true,
                        reference: true,
                        referenceType: true
                    }
                }
            },
            orderBy: [
                { journalEntry: { entryDate: 'asc' } },
                { journalEntry: { entryNumber: 'asc' } }
            ]
        });

        // Calculate beginning balance (all entries before startDate)
        let beginningBalance = 0;
        if (startDate) {
            const preLines = await prisma.journalLine.findMany({
                where: {
                    accountId,
                    journalEntry: {
                        status: 'POSTED',
                        entryDate: { lt: startDate }
                    }
                }
            });

            preLines.forEach(line => {
                const d = Number(line.debit);
                const c = Number(line.credit);
                if (account.type === 'ASSET' || account.type === 'EXPENSE') {
                    beginningBalance += d - c;
                } else {
                    beginningBalance += c - d;
                }
            });
        }

        // Calculate running balance starting from beginning balance
        let runningBalance = beginningBalance;
        const ledgerEntries = lines.map(line => {
            const debit = Number(line.debit);
            const credit = Number(line.credit);

            // For asset and expense accounts: debit increases, credit decreases
            // For liability, equity, and revenue: credit increases, debit decreases
            if (account.type === 'ASSET' || account.type === 'EXPENSE') {
                runningBalance += debit - credit;
            } else {
                runningBalance += credit - debit;
            }

            return {
                id: line.id,
                date: line.journalEntry.entryDate,
                entryNumber: line.journalEntry.entryNumber,
                description: line.description || line.journalEntry.description,
                reference: line.journalEntry.reference,
                referenceType: line.journalEntry.referenceType,
                debit,
                credit,
                balance: runningBalance
            };
        });

        return {
            account: {
                id: account.id,
                code: account.code,
                name: account.name,
                type: account.type,
                category: account.category,
                parent: account.parent
            },
            entries: ledgerEntries,
            summary: {
                beginningBalance,
                totalDebit: ledgerEntries.reduce((sum, e) => sum + e.debit, 0),
                totalCredit: ledgerEntries.reduce((sum, e) => sum + e.credit, 0),
                endingBalance: runningBalance
            }
        };
    });
}
);
