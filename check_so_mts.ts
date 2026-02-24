import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const so = await prisma.salesOrder.findUnique({
        where: { orderNumber: 'SO-2026-0006' },
        include: {
            customer: true,
            items: {
                include: { productVariant: true }
            }
        }
    });
    if (!so) return console.log('SO not found');
    const variant = await prisma.productVariant.findUnique({
        where: { id: '67afcf50-f8a2-4dea-ad11-733acc19682f' }
    });
    console.log(variant);
}

main().catch(console.error).finally(() => prisma.$disconnect());
