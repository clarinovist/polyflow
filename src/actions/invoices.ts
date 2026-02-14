'use server';

import { prisma } from '@/lib/prisma';
import { InvoiceStatus, Prisma } from '@prisma/client';

export async function getSalesInvoices(dateRange?: { startDate?: Date, endDate?: Date }) {
    const where: Prisma.InvoiceWhereInput = {};
    if (dateRange?.startDate && dateRange?.endDate) {
        where.invoiceDate = {
            gte: dateRange.startDate,
            lte: dateRange.endDate
        };
    }

    const invoices = await prisma.invoice.findMany({
        where,
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
                    include: { payments: true }
                });

                if (!invoice) throw new Error("Sales Invoice not found");

                // Find all IDs for payments associated with this invoice
                const paymentIds = invoice.payments.map(p => p.id);

                // 1. Delete associated Invoice Journal Entries
                await tx.journalLine.deleteMany({
                    where: { journalEntry: { referenceId: invoice.id, referenceType: ReferenceType.SALES_INVOICE } }
                });
                await tx.journalEntry.deleteMany({
                    where: { referenceId: invoice.id, referenceType: ReferenceType.SALES_INVOICE }
                });

                // 2. Delete associated Payment Journal Entries
                if (paymentIds.length > 0) {
                    await tx.journalLine.deleteMany({
                        where: {
                            journalEntry: {
                                referenceId: { in: paymentIds },
                                referenceType: ReferenceType.SALES_PAYMENT
                            }
                        }
                    });
                    await tx.journalEntry.deleteMany({
                        where: {
                            referenceId: { in: paymentIds },
                            referenceType: ReferenceType.SALES_PAYMENT
                        }
                    });
                }

                // 3. Delete Payment records first (mandatory due to FK)
                await tx.payment.deleteMany({ where: { invoiceId: id } });

                // 4. Delete Invoice
                await tx.invoice.delete({ where: { id } });
            } else {
                const invoice = await tx.purchaseInvoice.findUnique({
                    where: { id },
                    include: { payments: true }
                });

                if (!invoice) throw new Error("Purchase Invoice not found");

                const paymentIds = invoice.payments.map(p => p.id);

                // 1. Delete associated Invoice Journal Entries
                await tx.journalLine.deleteMany({
                    where: { journalEntry: { referenceId: invoice.id, referenceType: ReferenceType.PURCHASE_INVOICE } }
                });
                await tx.journalEntry.deleteMany({
                    where: { referenceId: invoice.id, referenceType: ReferenceType.PURCHASE_INVOICE }
                });

                // 2. Delete associated Payment Journal Entries
                if (paymentIds.length > 0) {
                    await tx.journalLine.deleteMany({
                        where: {
                            journalEntry: {
                                referenceId: { in: paymentIds },
                                referenceType: ReferenceType.PURCHASE_PAYMENT
                            }
                        }
                    });
                    await tx.journalEntry.deleteMany({
                        where: {
                            referenceId: { in: paymentIds },
                            referenceType: ReferenceType.PURCHASE_PAYMENT
                        }
                    });
                }

                // 3. Delete Payment records
                await tx.payment.deleteMany({ where: { purchaseInvoiceId: id } });

                // 4. Delete Invoice
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
