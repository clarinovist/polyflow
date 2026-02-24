import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const orderNumbers = ['WO-1771643017287', 'WO-1771643017279', 'WO-1771643017277'];

    for (const orderNumber of orderNumbers) {
        const po = await prisma.productionOrder.findUnique({
            where: { orderNumber },
            include: {
                plannedMaterials: {
                    include: {
                        productVariant: {
                            include: {
                                inventories: true
                            }
                        }
                    }
                },
                location: true
            }
        });

        if (!po) {
            console.log(`PO ${orderNumber} not found\n`);
            continue;
        }

        console.log(`\n============================`);
        console.log(`WO: ${po.orderNumber} | Status: ${po.status} | Location: ${po.location.name} (${po.locationId})`);

        for (const mat of po.plannedMaterials) {
            console.log(`- Material: ${mat.productVariant.name} (SKU: ${mat.productVariant.skuCode}) | Required Qty: ${mat.quantity}`);
            console.log(`  Stock Details:`);
            let hasSufficientStock = false;
            let totalStock = 0;
            let stockInLocation = 0;
            for (const inv of mat.productVariant.inventories) {
                console.log(`    Location ID: ${inv.locationId} | Qty: ${inv.quantity}`);
                totalStock += Number(inv.quantity);
                if (inv.locationId === po.locationId) {
                    stockInLocation += Number(inv.quantity);
                }
            }
            console.log(`  Total Stock: ${totalStock} | Stock in WO Location: ${stockInLocation}`);
            if (stockInLocation >= Number(mat.quantity)) {
                hasSufficientStock = true;
            }
            console.log(`  Has Sufficient Stock in Location?: ${hasSufficientStock}`);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
