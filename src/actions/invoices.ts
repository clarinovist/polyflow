'use server';

import { prisma } from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

export async function getSalesInvoices() {
    const invoices = await prisma.invoice.findMany({
        orderBy: {
            createdAt: 'desc',
        },
        include: {
            salesOrder: {
                select: {
                    orderNumber: true,
                    customer: {
                        select: {
                            name: true,
                        },
                    },
                },
            },
        },
    });

    return invoices;
}

export async function getPurchaseInvoices() {
    const invoices = await prisma.purchaseInvoice.findMany({
        orderBy: {
            createdAt: 'desc',
        },
        include: {
            purchaseOrder: {
                select: {
                    orderNumber: true,
                    supplier: {
                        select: {
                            name: true,
                        },
                    },
                },
            },
        },
    });

    return invoices;
}

export async function getInvoiceStats() {
    // 1. Unpaid Amount
    const unpaid = await prisma.invoice.aggregate({
        _sum: {
            totalAmount: true,
            paidAmount: true
        },
        where: {
            status: {
                in: ['UNPAID', 'PARTIAL', 'OVERDUE'] as InvoiceStatus[]
            }
        }
    });

    // Calculate actual outstanding (Total - Paid)
    const totalOutstanding = (Number(unpaid._sum.totalAmount) || 0) - (Number(unpaid._sum.paidAmount) || 0);

    // 2. Overdue Count
    const overdueCount = await prisma.invoice.count({
        where: {
            status: 'OVERDUE'
        }
    });

    return {
        totalOutstanding,
        overdueCount
    };
}

export async function deleteInvoice(id: string, type: 'AR' | 'AP') {
    const { requireAuth } = await import('@/lib/auth-checks');
    const { revalidatePath } = await import('next/cache');
    const { ReferenceType } = await import('@prisma/client');

    await requireAuth();

    try {
        await prisma.$transaction(async (tx) => {
            if (type === 'AR') {
                const invoice = await tx.invoice.findUnique({
                    where: { id },
                });

                if (!invoice) throw new Error("Sales Invoice not found");

                // Delete associated Journal Entries
                await tx.journalLine.deleteMany({
                    where: { journalEntry: { referenceId: invoice.id, referenceType: ReferenceType.SALES_INVOICE } }
                });
                await tx.journalEntry.deleteMany({
                    where: { referenceId: invoice.id, referenceType: ReferenceType.SALES_INVOICE }
                });

                // Delete Invoice
                await tx.invoice.delete({ where: { id } });
            } else {
                const invoice = await tx.purchaseInvoice.findUnique({
                    where: { id },
                });

                if (!invoice) throw new Error("Purchase Invoice not found");

                // Delete associated Journal Entries
                await tx.journalLine.deleteMany({
                    where: { journalEntry: { referenceId: invoice.id, referenceType: ReferenceType.PURCHASE_INVOICE } }
                });
                await tx.journalEntry.deleteMany({
                    where: { referenceId: invoice.id, referenceType: ReferenceType.PURCHASE_INVOICE }
                });

                // Delete Invoice
                await tx.purchaseInvoice.delete({ where: { id } });
            }
        });

        revalidatePath('/sales/invoices');
        revalidatePath('/finance/payables');
        revalidatePath('/finance/reports/balance-sheet');
        return { success: true };
    } catch (error) {
        console.error('Failed to delete invoice:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Deletion failed' };
    }
}
