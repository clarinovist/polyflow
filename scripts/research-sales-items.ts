import { PrismaClient, SalesOrderStatus } from '@prisma/client';
import { startOfDay, endOfDay, subDays } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
    const now = new Date('2026-02-08T19:34:31+07:00');
    const endDate = endOfDay(now);
    const startDate = startOfDay(subDays(now, 30));

    console.log(`Checking Sales Orders from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const orders = await prisma.salesOrder.findMany({
        where: {
            orderDate: { gte: startDate, lte: endDate },
            status: { in: [SalesOrderStatus.CONFIRMED, SalesOrderStatus.SHIPPED, SalesOrderStatus.DELIVERED] }
        },
        include: {
            items: true
        }
    });

    console.log(`Found ${orders.length} orders.`);

    orders.forEach(order => {
        console.log(`Order: ${order.orderNumber}, Items Count: ${order.items.length}, TotalAmount: ${order.totalAmount}`);
        order.items.forEach(item => {
            console.log(`  - Item: productVariantId=${item.productVariantId}, Qty=${item.quantity}, Subtotal=${item.subtotal}`);
        });
    });

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
