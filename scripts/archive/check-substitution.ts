import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const orderNumber = 'WO-260207-MIX99';
    const order = await prisma.productionOrder.findUnique({
        where: { orderNumber },
        include: {
            plannedMaterials: {
                include: {
                    productVariant: true
                }
            },
            materialIssues: {
                include: {
                    productVariant: true
                }
            },
            bom: {
                include: {
                    items: {
                        include: {
                            productVariant: true
                        }
                    }
                }
            }
        },
    });

    if (!order) {
        console.log('Order not found');
        return;
    }

    console.log(`--- Order: ${order.orderNumber} ---`);

    console.log('\n--- Planned Materials ---');
    let totalPlanned = 0;
    order.plannedMaterials.forEach(pm => {
        const qty = Number(pm.quantity);
        totalPlanned += qty;
        console.log(`- ${pm.productVariant.skuCode.padEnd(10)} | ${pm.productVariant.name.padEnd(20)} | Qty: ${qty}`);
    });
    console.log(`Total Planned Quantity: ${totalPlanned}`);

    console.log('\n--- Original BOM Items (Ratio for Reference) ---');
    let totalBOMOriginal = 0;
    order.bom?.items.forEach(bi => {
        const ratio = order.plannedQuantity ? (Number(order.plannedQuantity) / Number(order.bom?.outputQuantity)) : 1;
        const qty = Number(bi.quantity) * ratio;
        totalBOMOriginal += qty;
        console.log(`- ${bi.productVariant.skuCode.padEnd(10)} | ${bi.productVariant.name.padEnd(20)} | Qty: ${qty.toFixed(2)}`);
    });
    console.log(`Total Original BOM Qty (scaled): ${totalBOMOriginal.toFixed(2)}`);

    console.log('\n--- Material Issues ---');
    order.materialIssues.forEach(mi => {
        console.log(`- ${mi.productVariant.skuCode.padEnd(10)} | ${mi.productVariant.name.padEnd(20)} | Qty: ${mi.quantity}`);
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
