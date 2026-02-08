import { PrismaClient, SalesOrderStatus, PurchaseOrderStatus } from '@prisma/client';
import { startOfMonth, endOfMonth } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
    const now = new Date('2026-02-08T19:34:31+07:00');
    const startOfCurrentMonth = startOfMonth(now);
    const endOfCurrentMonth = endOfMonth(now);

    console.log(`Researching data from ${startOfCurrentMonth} to ${endOfCurrentMonth}`);

    const salesOrders = await prisma.salesOrder.findMany({
        where: {
            OR: [
                { createdAt: { gte: startOfCurrentMonth, lte: endOfCurrentMonth } },
                { orderDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth } }
            ],
            status: { not: SalesOrderStatus.CANCELLED }
        },
        include: {
            customer: true
        }
    });

    console.log('\n--- Sales Orders Comparison ---');
    salesOrders.forEach(order => {
        const amount = Number(order.totalAmount || 0);
        console.log(`Order: ${order.orderNumber}, Amount: Rp ${amount.toLocaleString()}, createdAt: ${order.createdAt.toISOString()}, orderDate: ${order.orderDate.toISOString()}`);
    });

    const purchaseOrders = await prisma.purchaseOrder.findMany({
        where: {
            OR: [
                { createdAt: { gte: startOfCurrentMonth, lte: endOfCurrentMonth } },
                { orderDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth } }
            ],
            status: { not: PurchaseOrderStatus.CANCELLED }
        },
        include: {
            supplier: true
        }
    });

    console.log('\n--- Purchase Orders Comparison ---');
    purchaseOrders.forEach(order => {
        const amount = Number(order.totalAmount || 0);
        console.log(`Order: ${order.orderNumber}, Amount: Rp ${amount.toLocaleString()}, createdAt: ${order.createdAt.toISOString()}, orderDate: ${order.orderDate.toISOString()}`);
    });

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
