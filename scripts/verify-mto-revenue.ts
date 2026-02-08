import { PrismaClient, SalesOrderStatus, SalesOrderType } from '@prisma/client';
import { startOfMonth, endOfMonth } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
    const now = new Date('2026-02-08');
    const startOfCurrentMonth = startOfMonth(now);
    const endOfCurrentMonth = endOfMonth(now);

    console.log(`Verifying Sales Orders for ${startOfCurrentMonth.toISOString()} to ${endOfCurrentMonth.toISOString()}`);

    const allOrders = await prisma.salesOrder.findMany({
        where: {
            orderDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth },
            status: { not: SalesOrderStatus.CANCELLED }
        },
        select: { orderNumber: true, totalAmount: true, orderType: true }
    });

    console.log(`Found ${allOrders.length} total orders (excluding cancelled).`);

    let totalMTO = 0;
    let totalMTS = 0;

    allOrders.forEach(order => {
        const amount = Number(order.totalAmount);
        console.log(`- ${order.orderNumber}: Rp ${amount.toLocaleString()} (${order.orderType})`);
        if (order.orderType === SalesOrderType.MAKE_TO_ORDER) {
            totalMTO += amount;
        } else {
            totalMTS += amount;
        }
    });

    console.log('\n--- Summary ---');
    console.log(`Total MTO Revenue: Rp ${totalMTO.toLocaleString()}`);
    console.log(`Total MTS Revenue: Rp ${totalMTS.toLocaleString()}`);
    console.log(`Combined Total: Rp ${(totalMTO + totalMTS).toLocaleString()}`);

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
