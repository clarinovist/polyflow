
import { prisma } from '../src/lib/prisma';

async function main() {
    console.log('🏗️ Migrating historical journal lines to new specialized accounts...');

    const oldToNew = {
        '11310': '12100', // Raw Material
        '11320': '12400', // WIP
        '11330': '12500', // FG
        '11390': '12300', // Scrap
    };

    // 1. Simple replacements for generic inventory
    for (const [oldCode, newCode] of Object.entries(oldToNew)) {
        const oldAcc = await prisma.account.findUnique({ where: { code: oldCode } });
        const newAcc = await prisma.account.findUnique({ where: { code: newCode } });

        if (oldAcc && newAcc) {
            const result = await prisma.journalLine.updateMany({
                where: { accountId: oldAcc.id },
                data: { accountId: newAcc.id }
            });
            console.log(`✅ Migrated ${result.count} lines from ${oldCode} to ${newCode}`);
        }
    }

    // 2. Specialized COGS migration (50000 -> 51100, 51200, etc.)
    // We look at StockMovements of type OUT with a SalesOrderId
    const cogsMovements = await prisma.stockMovement.findMany({
        where: { type: 'OUT', NOT: { salesOrderId: null } },
        include: {
            productVariant: { include: { product: true } }
        }
    });

    console.log(`🔍 Processing ${cogsMovements.length} COGS movements for granular account mapping...`);
    for (const m of cogsMovements) {
        const product = m.productVariant.product;
        if (!product.cogsAccountId) continue;

        // Find the journal entry for this movement
        const je = await prisma.journalEntry.findFirst({
            where: { referenceId: m.id, referenceType: 'MANUAL_ENTRY' } // Stock movement journals usually have MANUAL_ENTRY type in my current logic
        });

        if (je) {
            // Find the line that was originally hitting COGS (50000)
            const oldCogsAcc = await prisma.account.findUnique({ where: { code: '50000' } });
            if (oldCogsAcc) {
                const result = await prisma.journalLine.updateMany({
                    where: {
                        journalEntryId: je.id,
                        accountId: oldCogsAcc.id
                    },
                    data: { accountId: product.cogsAccountId }
                });
                if (result.count > 0) {
                    // Also ensure the other side (Inventory) is correct
                    if (product.inventoryAccountId) {
                        await prisma.journalLine.updateMany({
                            where: {
                                journalEntryId: je.id,
                                NOT: { accountId: product.cogsAccountId }
                            },
                            data: { accountId: product.inventoryAccountId }
                        });
                    }
                }
            }
        }
    }

    console.log('🏁 Historical journal migration complete!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
