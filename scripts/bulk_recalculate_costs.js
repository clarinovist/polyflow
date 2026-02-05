// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function recalculateAllCosts() {
    console.log('--- Bulk Recalculating Standard Costs (3 Passes) ---');
    try {
        for (let pass = 1; pass <= 3; pass++) {
            console.log(`\n=== PASS ${pass} ===`);
            const boms = await prisma.bom.findMany({
                where: { isDefault: true },
                include: {
                    items: {
                        include: {
                            productVariant: true
                        }
                    },
                    productVariant: true
                }
            });

            console.log(`Processing ${boms.length} default BOMs...`);

            for (const bom of boms) {
                let totalCost = 0;
                for (const item of bom.items) {
                    const variant = item.productVariant;
                    const cost = Number(variant.standardCost ?? variant.buyPrice ?? variant.price ?? 0);
                    const quantity = Number(item.quantity);
                    const scrap = 1 + (Number(item.scrapPercentage ?? 0) / 100);
                    totalCost += cost * quantity * scrap;
                }

                const unitCost = totalCost / Number(bom.outputQuantity || 1);

                await prisma.productVariant.update({
                    where: { id: bom.productVariantId },
                    data: { standardCost: unitCost }
                });

                if (pass === 3 || bom.productVariant.skuCode === 'PKHDT002' || bom.productVariant.skuCode === 'FGROL009') {
                    console.log(`[Pass ${pass}] Updated ${bom.productVariant.skuCode}: UnitCost=${unitCost.toFixed(2)}`);
                }
            }
        }

        console.log('\nMulti-pass recalculation complete.');

    } catch (error) {
        console.error('Recalculation failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

recalculateAllCosts();
