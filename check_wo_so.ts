import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const orderNumbers = ['WO-1771643017287', 'WO-1771643017279', 'WO-1771643017277'];

    for (const orderNumber of orderNumbers) {
        const po = await prisma.productionOrder.findUnique({
            where: { orderNumber },
            include: {
                salesOrder: true
            }
        });

        if (!po) continue;
        console.log(`WO ${po.orderNumber} -> Linked SO: ${po.salesOrder?.orderNumber}, SO Type: ${po.salesOrder?.orderType}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
