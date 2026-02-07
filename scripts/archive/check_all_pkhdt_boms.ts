import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAllPkhdt002Boms() {
    console.log('--- Checking ALL BOMs for PKHDT002 ---');
    try {
        const boms = await prisma.bom.findMany({
            where: {
                productVariant: {
                    skuCode: 'PKHDT002'
                }
            },
            include: {
                productVariant: true,
                items: {
                    include: {
                        productVariant: true
                    }
                }
            }
        });

        console.log(`Total BOMs found: ${boms.length}`);

        boms.forEach((bom, i) => {
            console.log(`\nBOM ${i + 1}: ${bom.name}`);
            console.log(`ID: ${bom.id}`);
            console.log(`Is Default: ${bom.isDefault}`);
            console.log(`Output: ${bom.outputQuantity}`);

            const totalCost = bom.items.reduce((acc, item) => {
                const v = item.productVariant;
                const cost = Number(v.standardCost ?? v.buyPrice ?? v.price ?? 0);
                const qty = Number(item.quantity);
                const scrap = 1 + (Number(item.scrapPercentage ?? 0) / 100);
                return acc + (cost * qty * scrap);
            }, 0);

            console.log(`Calculated Total Cost: ${totalCost}`);
            console.log(`Items: ${bom.items.length}`);
            bom.items.forEach(item => {
                console.log(` - SKU: ${item.productVariant.skuCode}, Qty: ${item.quantity}, Cost: ${item.productVariant.standardCost ?? item.productVariant.price}`);
            });
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkAllPkhdt002Boms();
