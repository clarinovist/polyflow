import { prisma } from '@/lib/core/prisma';
import { JournalStatus, ReferenceType } from '@prisma/client';
import { CreateJournalEntryInput } from '@/services/accounting/types';
import { createJournalEntry, postJournal } from '@/services/accounting/journals-service';

export interface CreatePettyCashValues {
    date: Date;
    description: string;
    amount: number;
    expenseAccountId?: string;
}

export class PettyCashService {
    /**
     * Get all petty cash transactions
     */
    static async getTransactions() {
        return await prisma.pettyCashTransaction.findMany({
            include: {
                expenseAccount: true,
                createdBy: { select: { name: true } }
            },
            orderBy: { date: 'desc' }
        });
    }

    /**
     * Get petty cash balance (from Chart of Accounts: 11110)
     */
    static async getBalance() {
        const account = await prisma.account.findFirst({
            where: { code: '11110' }
        });

        if (!account) return 0;

        const result = await prisma.journalLine.aggregate({
            where: {
                accountId: account.id,
                journalEntry: {
                    status: JournalStatus.POSTED
                }
            },
            _sum: {
                debit: true,
                credit: true
            }
        });

        const debit = result._sum?.debit ? result._sum.debit.toNumber() : 0;
        const credit = result._sum?.credit ? result._sum.credit.toNumber() : 0;

        // Petty Cash is an Asset, so normal balance is Debit
        return debit - credit;
    }

    /**
     * Create a new expense voucher
     */
    static async createExpense(data: CreatePettyCashValues, userId: string) {
        // Generate voucher number
        const yearMonth = new Date().toISOString().slice(0, 7).replace('-', '');
        const count = await prisma.pettyCashTransaction.count({
            where: { voucherNumber: { startsWith: `PCV-${yearMonth}` } }
        });
        const voucherNumber = `PCV-${yearMonth}-${String(count + 1).padStart(3, '0')}`;

        return await prisma.pettyCashTransaction.create({
            data: {
                voucherNumber,
                date: data.date,
                description: data.description,
                amount: data.amount,
                type: 'EXPENSE',
                expenseAccountId: data.expenseAccountId,
                status: 'DRAFT',
                createdById: userId
            }
        });
    }

    /**
     * Approve and post an expense voucher to the ledger
     */
    static async approveExpense(id: string, userId: string) {
        const transaction = await prisma.pettyCashTransaction.findUnique({
            where: { id },
            include: { expenseAccount: true }
        });

        if (!transaction) throw new Error("Transaction not found");
        if (transaction.status !== 'DRAFT') throw new Error("Only draft transactions can be approved");
        if (!transaction.expenseAccountId) throw new Error("Expense account must be selected");

        const pettyCashAccount = await prisma.account.findFirst({
            where: { code: '11110' } // Default standard CoA code for Petty Cash
        });

        if (!pettyCashAccount) throw new Error("Petty Cash account (11110) not found");

        return await prisma.$transaction(async (tx) => {
            // Update status
            const updated = await tx.pettyCashTransaction.update({
                where: { id },
                data: { status: 'POSTED' }
            });

            // Post to Journal
            const journalData: CreateJournalEntryInput = {
                entryDate: transaction.date,
                description: `Petty Cash: ${transaction.description}`,
                reference: transaction.voucherNumber,
                referenceType: ReferenceType.PETTY_CASH,
                referenceId: transaction.id,
                lines: [
                    // Expense Account - DEBIT
                    {
                        accountId: transaction.expenseAccountId!,
                        debit: transaction.amount.toNumber(),
                        credit: 0
                    },
                    // Petty Cash Account - CREDIT
                    {
                        accountId: pettyCashAccount.id,
                        debit: 0,
                        credit: transaction.amount.toNumber()
                    }
                ],
                createdById: userId
            };

            const journal = await createJournalEntry(journalData, tx);
            await postJournal(journal.id, userId, tx);

            await tx.pettyCashTransaction.update({
                where: { id },
                data: { journalEntryId: journal.id }
            });

            return updated;
        });
    }

    /**
     * Replenish Petty Cash from Bank Account
     */
    static async replenish(amount: number, bankAccountId: string, userId: string) {
        const pettyCashAccount = await prisma.account.findFirst({
            where: { code: '11110' }
        });

        if (!pettyCashAccount) throw new Error("Petty Cash account (11110) not found");

        const yearMonth = new Date().toISOString().slice(0, 7).replace('-', '');
        const count = await prisma.pettyCashTransaction.count({
            where: { voucherNumber: { startsWith: `PCR-${yearMonth}` } }
        });
        const voucherNumber = `PCR-${yearMonth}-${String(count + 1).padStart(3, '0')}`;

        return await prisma.$transaction(async (tx) => {
            const replenishment = await tx.pettyCashTransaction.create({
                data: {
                    voucherNumber,
                    date: new Date(),
                    description: `Petty Cash Replenishment`,
                    amount: amount,
                    type: 'REPLENISHMENT',
                    status: 'POSTED',
                    createdById: userId
                }
            });

            const journalData: CreateJournalEntryInput = {
                entryDate: new Date(),
                description: `Petty Cash Replenishment`,
                reference: voucherNumber,
                referenceType: ReferenceType.PETTY_CASH,
                referenceId: replenishment.id,
                lines: [
                    // Petty Cash Account - DEBIT
                    {
                        accountId: pettyCashAccount.id,
                        debit: amount,
                        credit: 0
                    },
                    // Bank Account - CREDIT
                    {
                        accountId: bankAccountId,
                        debit: 0,
                        credit: amount
                    }
                ],
                createdById: userId
            };

            const journal = await createJournalEntry(journalData, tx);
            await postJournal(journal.id, userId, tx);

            await tx.pettyCashTransaction.update({
                where: { id: replenishment.id },
                data: { journalEntryId: journal.id }
            });

            return replenishment;
        });
    }
}
