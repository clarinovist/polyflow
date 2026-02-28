import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    const reservations = await prisma.stockReservation.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
            productVariant: {
                select: { name: true, skuCode: true }
            },
            location: {
                select: { name: true }
            }
        }
    });
    
    // For each reservation, try to fetch the related Sales Order if reservedFor === 'SALES_ORDER'
    const enriched = await Promise.all(reservations.map(async (res) => {
        let reference = null;
        if (res.reservedFor === 'SALES_ORDER' && res.referenceId) {
            reference = await prisma.salesOrder.findUnique({
                where: { id: res.referenceId },
                select: { orderNumber: true, status: true, customer: { select: { name: true } } }
            });
        }
        return {
            ...res,
            referenceRecord: reference
        };
    }));

    console.log(JSON.stringify(enriched, null, 2));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
