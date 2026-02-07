import { prisma } from '../src/lib/prisma';

async function main() {
    const orders = await prisma.salesOrder.findMany({
        select: {
            orderNumber: true,
            status: true,
            orderDate: true
        }
    });
    console.log('Current Sales Orders:');
    console.dir(orders, { depth: null });
}

main().catch(console.error);
