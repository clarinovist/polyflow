import { InvoiceStatus, NotificationType } from '@prisma/client';

import { prisma } from '@/lib/core/prisma';

export async function checkOverdueSalesInvoices() {
    const { NotificationService } = await import('@/services/core/notification-service');

    const overdueInvoices = await prisma.invoice.findMany({
        where: {
            dueDate: { lt: new Date() },
            status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] }
        },
        include: { salesOrder: { select: { orderNumber: true } } }
    });

    if (overdueInvoices.length === 0) {
        return;
    }

    const targetUsers = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true }
    });

    if (targetUsers.length === 0) {
        return;
    }

    const inputs = overdueInvoices.flatMap(invoice =>
        targetUsers.map(user => ({
            userId: user.id,
            type: 'OVERDUE_AR' as NotificationType,
            title: 'Overdue Sales Invoice',
            message: `Customer Invoice ${invoice.invoiceNumber} is overdue since ${invoice.dueDate?.toLocaleDateString() || 'Unknown'}. Outstanding: ${invoice.totalAmount.toNumber() - invoice.paidAmount.toNumber()}`,
            link: `/admin/sales/invoices/${invoice.id}`,
            entityType: 'Invoice',
            entityId: invoice.id
        }))
    );

    await NotificationService.createBulkNotifications(inputs);
}