import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function bulkFixBomQuantities() {
    console.log('--- Bulk Fixing BOM Quantity Mismatches (1:100) ---');
    try {
        const boms = await prisma.bom.findMany({
            where: {
                category: {
                    in: ['PACKING', 'EXTRUSION']
                }
            },
            include: {
                items: true
            }
        });

        let count = 0;
        for (const bom of boms) {
            if (bom.items.length === 1 &&
                Number(bom.items[0].quantity) === 1 &&
                Number(bom.outputQuantity) > 1) {

                console.log(`Fixing BOM: "${bom.name}" (ID: ${bom.id})`);
                console.log(` - Updating item quantity from 1 to ${bom.outputQuantity}`);

                await prisma.bomItem.update({
                    where: { id: bom.items[0].id },
                    data: { quantity: bom.outputQuantity }
                });

                count++;
            }
        }

        console.log(`\nSuccessfully fixed ${count} BOMs.`);

    } catch (error) {
        console.error('Error during bulk fix:', error);
    } finally {
        await prisma.$disconnect();
    }
}

bulkFixBomQuantities();
