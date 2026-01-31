import { prisma } from '@/lib/prisma';
import { formatRupiah } from '@/lib/utils';

export async function checkCreditLimit(customerId: string, newAmount: number) {
    const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        include: {
            salesOrders: { where: { status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED'] } } }
        }
    });

    if (customer && customer.creditLimit && customer.creditLimit.toNumber() > 0) {
        const unpaidInvoices = await prisma.invoice.findMany({
            where: {
                salesOrder: { customerId: customerId },
                status: { in: ['UNPAID', 'PARTIAL'] }
            }
        });

        const unpaidTotal = unpaidInvoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.paidAmount)), 0);

        const activeOrders = await prisma.salesOrder.findMany({
            where: {
                customerId: customerId,
                status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED'] },
                invoices: { none: {} }
            }
        });

        const activeOrderTotal = activeOrders.reduce((sum, so) => sum + Number(so.totalAmount || 0), 0);
        const currentExposure = unpaidTotal + activeOrderTotal;
        const newExposure = currentExposure + newAmount;

        if (newExposure > customer.creditLimit.toNumber()) {
            throw new Error(`Credit Limit Exceeded. Limit: ${formatRupiah(customer.creditLimit.toNumber())}, Exposure: ${formatRupiah(currentExposure)}, New: ${formatRupiah(newAmount)}`);
        }
    }
}
