'use server';

import { Prisma } from '@prisma/client';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import { requireAuth } from '@/lib/tools/auth-checks';

export const getReceivedPayments = withTenant(
async function getReceivedPayments(dateRange?: { startDate?: Date, endDate?: Date }, demandType?: 'customer' | 'legacy-internal') {
    return safeAction(async () => {
        await requireAuth();

        const where: Prisma.PaymentWhereInput = {
            invoiceId: { not: null }
        };

        if (dateRange?.startDate && dateRange?.endDate) {
            where.paymentDate = {
                gte: dateRange.startDate,
                lte: dateRange.endDate
            };
        }

        if (demandType === 'customer') {
            where.invoice = {
                salesOrder: {
                    customerId: { not: null }
                }
            };
        } else if (demandType === 'legacy-internal') {
            where.invoice = {
                salesOrder: {
                    customerId: null
                }
            };
        }

        const payments = await prisma.payment.findMany({
            where,
            include: {
                invoice: {
                    include: {
                        salesOrder: {
                            include: {
                                customer: true
                            }
                        }
                    }
                }
            },
            orderBy: { paymentDate: 'desc' }
        });

        return serializeData(payments.map(payment => ({
            id: payment.id,
            referenceNumber: payment.paymentNumber,
            date: payment.paymentDate,
            entityName: payment.invoice?.salesOrder?.customer?.name
                || (payment.invoice?.salesOrder?.orderNumber
                    ? `Legacy Internal Stock Build (${payment.invoice.salesOrder.orderNumber})`
                    : 'Legacy Internal Stock Build'),
            amount: Number(payment.amount),
            method: payment.method,
            status: 'COMPLETED'
        })));
    });
}
);

export const getSentPayments = withTenant(
async function getSentPayments(dateRange?: { startDate?: Date, endDate?: Date }) {
    return safeAction(async () => {
        await requireAuth();

        const where: Prisma.PaymentWhereInput = {
            purchaseInvoiceId: { not: null }
        };

        if (dateRange?.startDate && dateRange?.endDate) {
            where.paymentDate = {
                gte: dateRange.startDate,
                lte: dateRange.endDate
            };
        }

        const payments = await prisma.payment.findMany({
            where,
            include: {
                purchaseInvoice: {
                    include: {
                        purchaseOrder: {
                            include: { supplier: true }
                        }
                    }
                }
            },
            orderBy: { paymentDate: 'desc' },
            take: 50
        });

        return serializeData(payments.map(payment => ({
            id: payment.id,
            referenceNumber: payment.paymentNumber,
            date: payment.paymentDate,
            entityName: payment.purchaseInvoice?.purchaseOrder.supplier.name || 'Unknown Supplier',
            amount: Number(payment.amount),
            method: payment.method,
            status: 'COMPLETED'
        })));
    });
}
);