import { PrismaClient, SalesOrderStatus, PurchaseOrderStatus } from '@prisma/client';
import { startOfMonth, endOfMonth } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
    const now = new Date('2026-02-08T19:34:31+07:00');
    const startOfCurrentMonth = startOfMonth(now);
    const endOfCurrentMonth = endOfMonth(now);

    console.log(`Verifying data using orderDate from ${startOfCurrentMonth} to ${endOfCurrentMonth}`);

    const salesOrders = await prisma.salesOrder.findMany({
        where: {
            orderDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth },
            status: { not: SalesOrderStatus.CANCELLED }
        }
    });

    console.log('\n--- Sales Orders (MTD by orderDate) ---');
    let totalSales = 0;
    salesOrders.forEach(order => {
        const amount = Number(order.totalAmount || 0);
        totalSales += amount;
        console.log(`Order: ${order.orderNumber}, Amount: Rp ${amount.toLocaleString()}, orderDate: ${order.orderDate}`);
    });
    console.log(`New Total Sales MTD: Rp ${totalSales.toLocaleString()}`);

    const purchaseOrders = await prisma.purchaseOrder.findMany({
        where: {
            orderDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth },
            status: { not: PurchaseOrderStatus.CANCELLED }
        }
    });

    console.log('\n--- Purchase Orders (MTD by orderDate) ---');
    let totalSpending = 0;
    purchaseOrders.forEach(order => {
        const amount = Number(order.totalAmount || 0);
        totalSpending += amount;
        console.log(`Order: ${order.orderNumber}, Amount: Rp ${amount.toLocaleString()}, orderDate: ${order.orderDate}`);
    });
    console.log(`New Total Spending MTD: Rp ${totalSpending.toLocaleString()}`);

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
