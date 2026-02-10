'use server';

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-checks';
import { AccountingService } from '@/services/accounting-service';
import { InvoiceStatus, PurchaseInvoiceStatus, ReferenceType, AccountType, AccountCategory, SalesOrderType, SalesOrderStatus, PurchaseOrderStatus, Prisma } from '@prisma/client';
import { serializeData } from '@/lib/utils';
import { revalidatePath } from 'next/cache';

const OPENING_BALANCE_ACCOUNT_CODE = '30000';
const AR_ACCOUNT_CODE = '11210';
const AP_ACCOUNT_CODE = '21110';

export interface CreateOpeningBalanceInput {
    type: 'AR' | 'AP'; // AR = Piutang (Customer), AP = Hutang (Supplier)
    entityId: string; // CustomerId or SupplierId
    invoiceNumber: string;
    date: Date;
    dueDate: Date;
    amount: number;
    notes?: string;
}

export async function getAccountsForOpeningBalance() {
    await requireAuth();
    const accounts = await prisma.account.findMany({
        where: {
            code: { not: OPENING_BALANCE_ACCOUNT_CODE }
        },
        orderBy: [{ type: 'asc' }, { code: 'asc' }],
        select: { id: true, code: true, name: true, type: true, category: true }
    });
    return accounts;
}

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

export async function saveUnifiedOpeningBalance(data: UnifiedMakeOpeningBalanceInput) {
    const session = await requireAuth();

    // Calculate total equity offset needed
    // Calculate total equity offset needed
    // const generalDebit = data.generalLines.reduce((sum, l) => sum + l.debit, 0);
    // const generalCredit = data.generalLines.reduce((sum, l) => sum + l.credit, 0);

    // AR entries debit AR, credit Equity
    // const arTotal = data.arEntries.reduce((sum, e) => sum + e.amount, 0);

    // AP entries credit AP, debit Equity
    // const apTotal = data.apEntries.reduce((sum, e) => sum + e.amount, 0);

    // Total Debit from User = General Debit + AR Total
    // Total Credit from User = General Credit + AP Total

    // Total Debit from User = General Debit + AR Total
    // Total Credit from User = General Credit + AP Total

    // Equity Offset = User Debit - User Credit.
    // If positive (Assets > Liabilities), we need to Credit Equity.
    // If negative (Liabilities > Assets), we need to Debit Equity.
    // const equityOffset = totalUserDebit - totalUserCredit; (Calculated inside transaction if needed, or we rely on generalOffset)

    // Check for duplicates BEFORE transaction to give clear error
    for (const entry of data.arEntries) {
        const [existingInvoice, existingSO] = await Promise.all([
            prisma.invoice.findFirst({ where: { invoiceNumber: entry.invoiceNumber } }),
            prisma.salesOrder.findFirst({ where: { orderNumber: `SO-OPEN-${entry.invoiceNumber}` } })
        ]);

        if (existingInvoice || existingSO) {
            return {
                success: false,
                error: `Customer Invoice #${entry.invoiceNumber} (or its placeholder SO) already exists. Please delete the previous entry or use a different number.`
            };
        }
    }

    for (const entry of data.apEntries) {
        const [existingBill, existingPO] = await Promise.all([
            prisma.purchaseInvoice.findFirst({ where: { invoiceNumber: entry.invoiceNumber } }),
            prisma.purchaseOrder.findFirst({ where: { orderNumber: `PO-OPEN-${entry.invoiceNumber}` } })
        ]);

        if (existingBill || existingPO) {
            return {
                success: false,
                error: `Supplier Bill #${entry.invoiceNumber} (or its placeholder PO) already exists. Please delete the previous entry or use a different number.`
            };
        }
    }

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Ensure "Opening Balance Equity" account exists
            let equityAccount = await tx.account.findUnique({ where: { code: OPENING_BALANCE_ACCOUNT_CODE } });
            if (!equityAccount) {
                // Use upsert to be safe against race conditions
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

            // 2. Process AR Entries (Create Invoice + Journal)
            if (data.arEntries.length > 0) {
                const subLedgerAccount = await tx.account.findUnique({ where: { code: AR_ACCOUNT_CODE } });
                if (!subLedgerAccount) throw new Error(`AR Account ${AR_ACCOUNT_CODE} not found.`);

                for (const entry of data.arEntries) {
                    await createAROpeningBalance(entry, session.user.id, equityAccount.id, subLedgerAccount.id, tx);
                }
            }

            // 3. Process AP Entries (Create Invoice + Journal)
            if (data.apEntries.length > 0) {
                const subLedgerAccount = await tx.account.findUnique({ where: { code: AP_ACCOUNT_CODE } });
                if (!subLedgerAccount) throw new Error(`AP Account ${AP_ACCOUNT_CODE} not found.`);

                for (const entry of data.apEntries) {
                    await createAPOpeningBalance(entry, session.user.id, equityAccount.id, subLedgerAccount.id, tx);
                }
            }

            // 4. Process General Lines (One Big Journal Entry)
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

                // Add equity balancing line for GENERAL items
                if (Math.abs(generalOffset) > 0.01) {
                    journalLines.push({
                        accountId: equityAccount.id,
                        debit: generalOffset < 0 ? Math.abs(generalOffset) : 0,
                        credit: generalOffset > 0 ? generalOffset : 0,
                        description: 'Opening Balance Equity (General Offset)'
                    });
                }

                if (journalLines.length > 0) {
                    // Create Journal Entry
                    const journal = await AccountingService.createJournalEntry({
                        entryDate: data.date,
                        description: `General Opening Balance - ${data.date.toISOString().split('T')[0]}`,
                        reference: 'OPENING-GEN',
                        referenceType: ReferenceType.MANUAL_ENTRY,
                        isAutoGenerated: true,
                        createdById: session.user.id,
                        lines: journalLines,
                    }, tx);

                    // Post it immediately
                    await AccountingService.postJournal(journal.id, session.user.id, tx);
                }
            }
        }, { timeout: 20000 });

        revalidatePath('/finance');
        revalidatePath('/finance/reports/balance-sheet');
        revalidatePath('/finance/opening-balance');
        return { success: true };
    } catch (error) {
        console.error('Unified Opening Balance Error:', error);
        // Return clear error message to UI
        return { success: false, error: error instanceof Error ? error.message : 'Failed to save opening balance. Please check server logs.' };
    }
}


export async function createOpeningBalance(data: CreateOpeningBalanceInput) {
    const session = await requireAuth();

    try {
        // 1. Ensure "Opening Balance Equity" account exists
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

        // 2. Get AR/AP Account
        const subLedgerAccountCode = data.type === 'AR' ? AR_ACCOUNT_CODE : AP_ACCOUNT_CODE;
        const subLedgerAccount = await prisma.account.findUnique({ where: { code: subLedgerAccountCode } });
        if (!subLedgerAccount) throw new Error(`Sub-ledger account ${subLedgerAccountCode} not found.`);

        // 3. Create Record
        // Wrapped in transaction to match signature, though for single item we could use prisma directly
        await prisma.$transaction(async (tx) => {
            if (data.type === 'AR') {
                await createAROpeningBalance(data, session.user.id, equityAccount.id, subLedgerAccount.id, tx);
            } else {
                await createAPOpeningBalance(data, session.user.id, equityAccount.id, subLedgerAccount.id, tx);
            }
        });

        revalidatePath('/finance');
        revalidatePath('/finance/reports/balance-sheet');
        return { success: true };
    } catch (error) {
        console.error('Opening Balance Error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create opening balance' };
    }
}

async function createAROpeningBalance(data: CreateOpeningBalanceInput, userId: string, equityAccountId: string, arAccountId: string, tx?: Prisma.TransactionClient) {
    const db = tx || prisma;

    // 3a. Create Dummy Sales Order (Use transaction to ensure atomicity if needed, but keeping simple for now)
    const salesOrder = await db.salesOrder.create({
        data: {
            orderNumber: `SO-OPEN-${data.invoiceNumber}`,
            customerId: data.entityId,
            orderDate: data.date,
            status: SalesOrderStatus.DELIVERED, // Mark as delivered so it doesn't show up in pending lists
            orderType: SalesOrderType.MAKE_TO_STOCK, // Generic
            totalAmount: data.amount,
            notes: 'Opening Balance Entry',
            createdById: userId,
            // Create a dummy item to satisfy constraints if necessary, or leave empty if schema allows
            // items: { create: [] } 
        }
    });

    // 3b. Create Invoice
    const invoice = await db.invoice.create({
        data: {
            invoiceNumber: data.invoiceNumber, // Keep original external invoice number
            salesOrderId: salesOrder.id,
            invoiceDate: data.date,
            dueDate: data.dueDate,
            status: InvoiceStatus.UNPAID,
            totalAmount: data.amount,
            notes: data.notes || 'Opening Balance Transfer',
            termOfPaymentDays: 0, // already calculated manually
        }
    });

    // 3c. Create Journal Entry (Override Auto-Journal)
    // Dr AR, Cr Opening Balance Equity
    await AccountingService.createJournalEntry({
        entryDate: data.date,
        description: `Opening Balance AR - Inv #${data.invoiceNumber}`,
        reference: data.invoiceNumber,
        referenceType: ReferenceType.SALES_INVOICE,
        referenceId: invoice.id,
        isAutoGenerated: true, // System generated but manual logic
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

    // 3a. Create Dummy Purchase Order
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

    // 3b. Create Purchase Invoice
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

    // 3c. Create Journal Entry
    // Dr Opening Balance Equity, Cr AP
    await AccountingService.createJournalEntry({
        entryDate: data.date,
        description: `Opening Balance AP - Inv #${data.invoiceNumber}`,
        reference: data.invoiceNumber,
        referenceType: ReferenceType.PURCHASE_INVOICE,
        referenceId: invoice.id,
        isAutoGenerated: true,
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

export async function getRecentOpeningBalances() {
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

        return { success: true, data: serializeData(history) };
    } catch (error) {
        console.error('Failed to fetch opening balance history:', error);
        return { success: false, error: 'Failed to fetch history' };
    }
}

export async function deleteOpeningBalance(id: string, type: 'AR' | 'AP') {
    await requireAuth();

    try {
        await prisma.$transaction(async (tx) => {
            if (type === 'AR') {
                const invoice = await tx.invoice.findUnique({
                    where: { id },
                    include: { salesOrder: true }
                });

                if (!invoice) throw new Error("Invoice not found");

                // Delete associated Journal Entries
                await tx.journalLine.deleteMany({
                    where: { journalEntry: { referenceId: invoice.id, referenceType: ReferenceType.SALES_INVOICE } }
                });
                await tx.journalEntry.deleteMany({
                    where: { referenceId: invoice.id, referenceType: ReferenceType.SALES_INVOICE }
                });

                // Delete Invoice
                await tx.invoice.delete({ where: { id } });

                // Delete Sales Order
                if (invoice.salesOrder) {
                    await tx.salesOrder.delete({ where: { id: invoice.salesOrderId } });
                }
            } else {
                const invoice = await tx.purchaseInvoice.findUnique({
                    where: { id },
                    include: { purchaseOrder: true }
                });

                if (!invoice) throw new Error("Purchase invoice not found");

                // Delete associated Journal Entries
                await tx.journalLine.deleteMany({
                    where: { journalEntry: { referenceId: invoice.id, referenceType: ReferenceType.PURCHASE_INVOICE } }
                });
                await tx.journalEntry.deleteMany({
                    where: { referenceId: invoice.id, referenceType: ReferenceType.PURCHASE_INVOICE }
                });

                // Delete Invoice
                await tx.purchaseInvoice.delete({ where: { id } });

                // Delete Purchase Order
                if (invoice.purchaseOrder) {
                    await tx.purchaseOrder.delete({ where: { id: invoice.purchaseOrderId } });
                }
            }
        });

        revalidatePath('/finance');
        revalidatePath('/finance/reports/balance-sheet');
        return { success: true };
    } catch (error) {
        console.error('Failed to delete opening balance:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Deletion failed' };
    }
}
