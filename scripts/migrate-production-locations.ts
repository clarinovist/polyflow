import { PrismaClient, MovementType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting data migration for MaterialIssue and ScrapRecord locations...');

    // 1. Backfill MaterialIssue
    const issues = await prisma.materialIssue.findMany({
        where: { locationId: null },
        include: { productionOrder: true }
    });

    console.log(`Found ${issues.length} MaterialIssue records without locationId.`);

    for (const issue of issues) {
        const orderNumber = issue.productionOrder.orderNumber;

        // Find matching StockMovement
        const movement = await prisma.stockMovement.findFirst({
            where: {
                productVariantId: issue.productVariantId,
                quantity: issue.quantity,
                type: MovementType.OUT,
                reference: { contains: orderNumber }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (movement && movement.fromLocationId) {
            await prisma.materialIssue.update({
                where: { id: issue.id },
                data: { locationId: movement.fromLocationId }
            });
            console.log(`Updated MaterialIssue ${issue.id} with location ${movement.fromLocationId}`);
        } else {
            console.warn(`Could not find movement for MaterialIssue ${issue.id} (Order: ${orderNumber})`);
            // Fallback to rm_warehouse slug if possible
            const rmLoc = await prisma.location.findUnique({ where: { slug: 'rm_warehouse' } });
            if (rmLoc) {
                await prisma.materialIssue.update({
                    where: { id: issue.id },
                    data: { locationId: rmLoc.id }
                });
                console.log(`Applied fallback 'rm_warehouse' to MaterialIssue ${issue.id}`);
            }
        }
    }

    // 2. Backfill ScrapRecord
    const scraps = await prisma.scrapRecord.findMany({
        where: { locationId: null },
        include: { productionOrder: true }
    });

    console.log(`Found ${scraps.length} ScrapRecord records without locationId.`);

    for (const scrap of scraps) {
        const orderNumber = scrap.productionOrder.orderNumber;

        // Find matching StockMovement
        const movement = await prisma.stockMovement.findFirst({
            where: {
                productVariantId: scrap.productVariantId,
                quantity: scrap.quantity,
                type: MovementType.IN,
                reference: { contains: orderNumber }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (movement && movement.toLocationId) {
            await prisma.scrapRecord.update({
                where: { id: scrap.id },
                data: { locationId: movement.toLocationId }
            });
            console.log(`Updated ScrapRecord ${scrap.id} with location ${movement.toLocationId}`);
        } else {
            console.warn(`Could not find movement for ScrapRecord ${scrap.id} (Order: ${orderNumber})`);
            // Fallback to scrap_warehouse slug if possible
            const scrapLoc = await prisma.location.findUnique({ where: { slug: 'scrap_warehouse' } });
            if (scrapLoc) {
                await prisma.scrapRecord.update({
                    where: { id: scrap.id },
                    data: { locationId: scrapLoc.id }
                });
                console.log(`Applied fallback 'scrap_warehouse' to ScrapRecord ${scrap.id}`);
            }
        }
    }

    console.log('Migration completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
