'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { AccountingService } from '@/services/accounting/accounting-service';
import { InvoiceStatus, PurchaseInvoiceStatus, ReferenceType, AccountType, AccountCategory, SalesOrderType, SalesOrderStatus, PurchaseOrderStatus, Prisma, JournalStatus } from '@prisma/client';
import { serializeData } from '@/lib/utils/utils';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError, NotFoundError } from '@/lib/errors/errors';

const OPENING_BALANCE_ACCOUNT_CODE = '30000';
const AR_ACCOUNT_CODE = '11210';
const AP_ACCOUNT_CODE = '21110';

export interface CreateOpeningBalanceInput {
    type: 'AR' | 'AP';
    entityId: string;
    invoiceNumber: string;
    date: Date;
    dueDate: Date;
    amount: number;
    notes?: string;
}

export const getAccountsForOpeningBalance = withTenant(
async function getAccountsForOpeningBalance() {
    return safeAction(async () => {
        await requireAuth();
        const accounts = await prisma.account.findMany({
            where: {
                code: { not: OPENING_BALANCE_ACCOUNT_CODE }
            },
            orderBy: [{ type: 'asc' }, { code: 'asc' }],
            select: { id: true, code: true, name: true, type: true, category: true }
        });
        return accounts;
    });
}
);

export interface GeneralOpeningBalanceLine {
    accountId: string;
    debit: number;
    credit: number;
}

export interface UnifiedMakeOpeningBalanceInput {
    date: Date;
    generalLines: GeneralOpeningBalanceLine[];
    arEntries: CreateOpeningBalanceInput[];
    apEntries: CreateOpeningBalanceInput[];
}

export const saveUnifiedOpeningBalance = withTenant(
async function saveUnifiedOpeningBalance(data: UnifiedMakeOpeningBalanceInput) {
    return safeAction(async () => {
        const session = await requireAuth();

        // Check for duplicates BEFORE transaction to give clear error
        for (const entry of data.arEntries) {
            const [existingInvoice, existingSO] = await Promise.all([
                prisma.invoice.findFirst({ where: { invoiceNumber: entry.invoiceNumber } }),
                prisma.salesOrder.findFirst({ where: { orderNumber: `SO-OPEN-${entry.invoiceNumber}` } })
            ]);

            if (existingInvoice || existingSO) {
                throw new BusinessRuleError(`Customer Invoice #${entry.invoiceNumber} (or its placeholder SO) already exists. Please delete the previous entry or use a different number.`);
            }
        }

        for (const entry of data.apEntries) {
            const [existingBill, existingPO] = await Promise.all([
                prisma.purchaseInvoice.findFirst({ where: { invoiceNumber: entry.invoiceNumber } }),
                prisma.purchaseOrder.findFirst({ where: { orderNumber: `PO-OPEN-${entry.invoiceNumber}` } })
            ]);

            if (existingBill || existingPO) {
                throw new BusinessRuleError(`Supplier Bill #${entry.invoiceNumber} (or its placeholder PO) already exists. Please delete the previous entry or use a different number.`);
            }
        }

        try {
            await prisma.$transaction(async (tx) => {
                // 1. Ensure "Opening Balance Equity" account exists
                let equityAccount = await tx.account.findUnique({ where: { code: OPENING_BALANCE_ACCOUNT_CODE } });
                if (!equityAccount) {
                    equityAccount = await tx.account.upsert({
                        where: { code: OPENING_BALANCE_ACCOUNT_CODE },
                        update: {},
                        create: {
                            code: OPENING_BALANCE_ACCOUNT_CODE,
                            name: 'Opening Balance Equity',
                            type: AccountType.EQUITY,
                            category: AccountCategory.CAPITAL,
                            description: 'System account for initial balance setup'
                        }
                    });
                }

                // 2. Process AR Entries
                if (data.arEntries.length > 0) {
                    const subLedgerAccount = await tx.account.findUnique({ where: { code: AR_ACCOUNT_CODE } });
                    if (!subLedgerAccount) throw new Error(`AR Account ${AR_ACCOUNT_CODE} not found.`);

                    for (const entry of data.arEntries) {
                        await createAROpeningBalance(entry, session.user.id, equityAccount.id, subLedgerAccount.id, tx);
                    }
                }

                // 3. Process AP Entries
                if (data.apEntries.length > 0) {
                    const subLedgerAccount = await tx.account.findUnique({ where: { code: AP_ACCOUNT_CODE } });
                    if (!subLedgerAccount) throw new Error(`AP Account ${AP_ACCOUNT_CODE} not found.`);

                    for (const entry of data.apEntries) {
                        await createAPOpeningBalance(entry, session.user.id, equityAccount.id, subLedgerAccount.id, tx);
                    }
                }

                // 4. Process General Lines
                const nonZeroLines = data.generalLines.filter(l => l.debit > 0 || l.credit > 0);
                const generalDebit = data.generalLines.reduce((sum, l) => sum + l.debit, 0);
                const generalCredit = data.generalLines.reduce((sum, l) => sum + l.credit, 0);
                const generalOffset = generalDebit - generalCredit;

                if (nonZeroLines.length > 0 || Math.abs(generalOffset) > 0.01) {
                    const journalLines = nonZeroLines.map(l => ({
                        accountId: l.accountId,
                        debit: l.debit,
                        credit: l.credit,
                        description: 'Opening Balance'
                    }));

                    if (Math.abs(generalOffset) > 0.01) {
                        journalLines.push({
                            accountId: equityAccount.id,
                            debit: generalOffset < 0 ? Math.abs(generalOffset) : 0,
                            credit: generalOffset > 0 ? generalOffset : 0,
                            description: 'Opening Balance Equity (General Offset)'
                        });
                    }

                    if (journalLines.length > 0) {
                        const journal = await AccountingService.createJournalEntry({
                            entryDate: data.date,
                            description: `General Opening Balance - ${data.date.toISOString().split('T')[0]}`,
                            reference: 'OPENING-GEN',
                            referenceType: ReferenceType.MANUAL_ENTRY,
                            isAutoGenerated: true,
                            createdById: session.user.id,
                            lines: journalLines,
                        }, tx);

                        await AccountingService.postJournal(journal.id, session.user.id, tx);
                    }
                }
            }, { timeout: 20000 });

            revalidatePath('/finance');
            revalidatePath('/finance/reports/balance-sheet');
            revalidatePath('/finance/opening-balance');
            return { message: "Opening balance saved successfully" };
        } catch (error) {
            if (error instanceof BusinessRuleError) throw error;
            logger.error('Failed to save unified opening balance', { error, module: 'OpeningBalanceActions' });
            throw new BusinessRuleError('Failed to save opening balance. Please verify entries.');
        }
    });
}
);

export const createOpeningBalance = withTenant(
async function createOpeningBalance(data: CreateOpeningBalanceInput) {
    return safeAction(async () => {
        const session = await requireAuth();

        try {
            let equityAccount = await prisma.account.findUnique({ where: { code: OPENING_BALANCE_ACCOUNT_CODE } });
            if (!equityAccount) {
                equityAccount = await prisma.account.create({
                    data: {
                        code: OPENING_BALANCE_ACCOUNT_CODE,
                        name: 'Opening Balance Equity',
                        type: AccountType.EQUITY,
                        category: AccountCategory.CAPITAL,
                        description: 'System account for initial balance setup'
                    }
                });
            }

            const subLedgerAccountCode = data.type === 'AR' ? AR_ACCOUNT_CODE : AP_ACCOUNT_CODE;
            const subLedgerAccount = await prisma.account.findUnique({ where: { code: subLedgerAccountCode } });
            if (!subLedgerAccount) throw new Error(`Sub-ledger account ${subLedgerAccountCode} not found.`);

            await prisma.$transaction(async (tx) => {
                if (data.type === 'AR') {
                    await createAROpeningBalance(data, session.user.id, equityAccount.id, subLedgerAccount.id, tx);
                } else {
                    await createAPOpeningBalance(data, session.user.id, equityAccount.id, subLedgerAccount.id, tx);
                }
            });

            revalidatePath('/finance');
            revalidatePath('/finance/reports/balance-sheet');
            return { message: "Opening balance created successfully" };
        } catch (error) {
            logger.error('Failed to create opening balance', { error, module: 'OpeningBalanceActions' });
            throw new BusinessRuleError('Failed to create opening balance. Please try again.');
        }
    });
}
);

async function createAROpeningBalance(data: CreateOpeningBalanceInput, userId: string, equityAccountId: string, arAccountId: string, tx?: Prisma.TransactionClient) {
    const db = tx || prisma;

    const salesOrder = await db.salesOrder.create({
        data: {
            orderNumber: `SO-OPEN-${data.invoiceNumber}`,
            customerId: data.entityId,
            orderDate: data.date,
            status: SalesOrderStatus.DELIVERED,
            orderType: SalesOrderType.MAKE_TO_STOCK,
            totalAmount: data.amount,
            notes: 'Opening Balance Entry',
            createdById: userId,
        }
    });

    const invoice = await db.invoice.create({
        data: {
            invoiceNumber: data.invoiceNumber,
            salesOrderId: salesOrder.id,
            invoiceDate: data.date,
            dueDate: data.dueDate,
            status: InvoiceStatus.UNPAID,
            totalAmount: data.amount,
            notes: data.notes || 'Opening Balance Transfer',
            termOfPaymentDays: 0,
        }
    });

    await AccountingService.createJournalEntry({
        entryDate: data.date,
        description: `Opening Balance AR - Inv #${data.invoiceNumber}`,
        reference: data.invoiceNumber,
        referenceType: ReferenceType.SALES_INVOICE,
        referenceId: invoice.id,
        isAutoGenerated: true,
        status: JournalStatus.POSTED,
        createdById: userId,
        lines: [
            {
                accountId: arAccountId,
                debit: data.amount,
                credit: 0,
                description: `Opening Balance Receivable`
            },
            {
                accountId: equityAccountId,
                debit: 0,
                credit: data.amount,
                description: `Opening Equity Offset`
            }
        ]
    }, db);

    return invoice;
}

async function createAPOpeningBalance(data: CreateOpeningBalanceInput, userId: string, equityAccountId: string, apAccountId: string, tx?: Prisma.TransactionClient) {
    const db = tx || prisma;

    const purchaseOrder = await db.purchaseOrder.create({
        data: {
            orderNumber: `PO-OPEN-${data.invoiceNumber}`,
            supplierId: data.entityId,
            orderDate: data.date,
            status: PurchaseOrderStatus.RECEIVED,
            totalAmount: data.amount,
            notes: 'Opening Balance Entry',
            createdById: userId,
        }
    });

    const invoice = await db.purchaseInvoice.create({
        data: {
            invoiceNumber: data.invoiceNumber,
            purchaseOrderId: purchaseOrder.id,
            invoiceDate: data.date,
            dueDate: data.dueDate,
            status: PurchaseInvoiceStatus.UNPAID,
            totalAmount: data.amount,
            notes: data.notes || 'Opening Balance Transfer',
        }
    });

    await AccountingService.createJournalEntry({
        entryDate: data.date,
        description: `Opening Balance AP - Inv #${data.invoiceNumber}`,
        reference: data.invoiceNumber,
        referenceType: ReferenceType.PURCHASE_INVOICE,
        referenceId: invoice.id,
        isAutoGenerated: true,
        status: JournalStatus.POSTED,
        createdById: userId,
        lines: [
            {
                accountId: equityAccountId,
                debit: data.amount,
                credit: 0,
                description: `Opening Equity Offset`
            },
            {
                accountId: apAccountId,
                debit: 0,
                credit: data.amount,
                description: `Opening Balance Payable`
            }
        ]
    }, db);

    return invoice;
}

export const getRecentOpeningBalances = withTenant(
async function getRecentOpeningBalances() {
    return safeAction(async () => {
        await requireAuth();

        try {
            const [arInvoices, apInvoices] = await Promise.all([
                prisma.invoice.findMany({
                    where: {
                        salesOrder: {
                            orderNumber: { startsWith: 'SO-OPEN-' }
                        }
                    },
                    include: {
                        salesOrder: {
                            include: { customer: { select: { name: true } } }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                }),
                prisma.purchaseInvoice.findMany({
                    where: {
                        purchaseOrder: {
                            orderNumber: { startsWith: 'PO-OPEN-' }
                        }
                    },
                    include: {
                        purchaseOrder: {
                            include: { supplier: { select: { name: true } } }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                })
            ]);

            const history = [
                ...arInvoices.map(inv => ({
                    id: inv.id,
                    type: 'AR' as const,
                    invoiceNumber: inv.invoiceNumber,
                    entityName: inv.salesOrder?.customer?.name || 'Unknown',
                    date: inv.invoiceDate,
                    amount: Number(inv.totalAmount),
                    createdAt: inv.createdAt
                })),
                ...apInvoices.map(inv => ({
                    id: inv.id,
                    type: 'AP' as const,
                    invoiceNumber: inv.invoiceNumber,
                    entityName: inv.purchaseOrder?.supplier?.name || 'Unknown',
                    date: inv.invoiceDate,
                    amount: Number(inv.totalAmount),
                    createdAt: inv.createdAt
                }))
            ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

            return serializeData(history);
        } catch (error) {
            logger.error('Failed to fetch opening balance history', { error, module: 'OpeningBalanceActions' });
            throw new BusinessRuleError('Failed to fetch opening balance history.');
        }
    });
}
);

export const deleteOpeningBalance = withTenant(
async function deleteOpeningBalance(id: string, type: 'AR' | 'AP') {
    return safeAction(async () => {
        await requireAuth();

        try {
            await prisma.$transaction(async (tx) => {
                if (type === 'AR') {
                    const invoice = await tx.invoice.findUnique({
                        where: { id },
                        include: { salesOrder: true }
                    });

                    if (!invoice) throw new NotFoundError("Invoice", id);

                    await tx.journalLine.deleteMany({
                        where: { journalEntry: { referenceId: invoice.id, referenceType: ReferenceType.SALES_INVOICE } }
                    });
                    await tx.journalEntry.deleteMany({
                        where: { referenceId: invoice.id, referenceType: ReferenceType.SALES_INVOICE }
                    });

                    await tx.invoice.delete({ where: { id } });

                    if (invoice.salesOrder) {
                        await tx.salesOrder.delete({ where: { id: invoice.salesOrderId } });
                    }
                } else {
                    const invoice = await tx.purchaseInvoice.findUnique({
                        where: { id },
                        include: { purchaseOrder: true }
                    });

                    if (!invoice) throw new NotFoundError("Purchase invoice", id);

                    await tx.journalLine.deleteMany({
                        where: { journalEntry: { referenceId: invoice.id, referenceType: ReferenceType.PURCHASE_INVOICE } }
                    });
                    await tx.journalEntry.deleteMany({
                        where: { referenceId: invoice.id, referenceType: ReferenceType.PURCHASE_INVOICE }
                    });

                    await tx.purchaseInvoice.delete({ where: { id } });

                    if (invoice.purchaseOrder) {
                        await tx.purchaseOrder.delete({ where: { id: invoice.purchaseOrderId } });
                    }
                }
            });

            revalidatePath('/finance');
            revalidatePath('/finance/reports/balance-sheet');
            return { message: "Opening balance deleted successfully" };
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error('Failed to delete opening balance', { error, id, type, module: 'OpeningBalanceActions' });
            throw new BusinessRuleError('Failed to delete opening balance.');
        }
    });
}
);
