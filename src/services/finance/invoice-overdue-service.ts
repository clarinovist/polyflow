import { InvoiceStatus, NotificationType } from '@prisma/client';

import { prisma } from '@/lib/core/prisma';

export async function checkOverdueSalesInvoices() {
    const { NotificationService } = await import('@/services/core/notification-service');

    const overdueInvoices = await prisma.invoice.findMany({
        where: {
            dueDate: { lt: new Date() },
            status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] }
        },
        include: {
            salesOrder: {
                select: {
                    orderNumber: true,
                    createdById: true,
                }
            }
        }
    });

    if (overdueInvoices.length === 0) {
        return;
    }

    // Notify ADMIN + the sales person who created the order
    const adminUsers = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true }
    });

    const salesUserIds = new Set(
        overdueInvoices
            .map(inv => inv.salesOrder?.createdById)
            .filter((id): id is string => !!id)
    );

    const salesUsers = salesUserIds.size > 0
        ? await prisma.user.findMany({
            where: { id: { in: Array.from(salesUserIds) } },
            select: { id: true }
        })
        : [];

    // Deduplicate (ADMIN who also owns orders)
    const allUserIds = new Set([
        ...adminUsers.map(u => u.id),
        ...salesUsers.map(u => u.id),
    ]);

    if (allUserIds.size === 0) {
        return;
    }

    const inputs = overdueInvoices.flatMap(invoice => {
        const outstanding = invoice.totalAmount.toNumber() - invoice.paidAmount.toNumber();
        const dueDateStr = invoice.dueDate?.toLocaleDateString('id-ID') || 'tidak diketahui';
        const soNumber = invoice.salesOrder?.orderNumber || '-';

        return Array.from(allUserIds).map(userId => ({
            userId,
            type: 'OVERDUE_AR' as NotificationType,
            title: 'Invoice Jatuh Tempo',
            message: `Invoice ${invoice.invoiceNumber} (SO: ${soNumber}) jatuh tempo sejak ${dueDateStr}. Sisa tagihan: Rp ${outstanding.toLocaleString('id-ID')}`,
            link: `/sales/invoices/${invoice.id}`,
            entityType: 'Invoice',
            entityId: invoice.id
        }));
    });

    await NotificationService.createBulkNotifications(inputs);
}
