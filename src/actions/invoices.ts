'use server';

import { prisma } from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

export async function getSalesInvoices() {
    const invoices = await prisma.invoice.findMany({
        where: {
            salesOrderId: {
                not: undefined // Ensure it's related to sales only, though our Invoice model enforces salesOrderId relation
            }
        },
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
