'use server';

import { ReferenceType } from '@prisma/client';
import { revalidatePath } from 'next/cache';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { logger } from '@/lib/config/logger';
import { BusinessRuleError, NotFoundError, safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import { requireAuth } from '@/lib/tools/auth-checks';

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
                ...arInvoices.map(invoice => ({
                    id: invoice.id,
                    type: 'AR' as const,
                    invoiceNumber: invoice.invoiceNumber,
                    entityName: invoice.salesOrder?.customer?.name || 'Unknown',
                    date: invoice.invoiceDate,
                    amount: Number(invoice.totalAmount),
                    createdAt: invoice.createdAt
                })),
                ...apInvoices.map(invoice => ({
                    id: invoice.id,
                    type: 'AP' as const,
                    invoiceNumber: invoice.invoiceNumber,
                    entityName: invoice.purchaseOrder?.supplier?.name || 'Unknown',
                    date: invoice.invoiceDate,
                    amount: Number(invoice.totalAmount),
                    createdAt: invoice.createdAt
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

                    if (!invoice) throw new NotFoundError('Invoice', id);

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

                    if (!invoice) throw new NotFoundError('Purchase invoice', id);

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
            return { message: 'Opening balance deleted successfully' };
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error('Failed to delete opening balance', { error, id, type, module: 'OpeningBalanceActions' });
            throw new BusinessRuleError('Failed to delete opening balance.');
        }
    });
}
);