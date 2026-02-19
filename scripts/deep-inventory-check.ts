
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Deep Inventory & Ledger Consistency Check ---');

    const codes = ['11310', '11320', '11330', '11340', '11350'];
    let totalGL = 0;

    console.log('\n--- GL Balances ---');
    for (const code of codes) {
        const account = await prisma.account.findUnique({
            where: { code },
            include: {
                journalLines: {
                    where: { journalEntry: { status: 'POSTED' } }
                }
            }
        });

        if (account) {
            const balance = account.journalLines.reduce((sum, l) => sum + (Number(l.debit) - Number(l.credit)), 0);
            totalGL += balance;
            console.log(`Account ${code} (${account.name}): Rp ${balance.toLocaleString()}`);
        } else {
            console.log(`Account ${code} not found!`);
        }
    }
    console.log(`Total Inventory GL Balance: Rp ${totalGL.toLocaleString()}`);

    // Inventory Valuation
    const stock = await prisma.inventory.findMany({
        include: {
            productVariant: {
                include: { product: true }
            }
        }
    });

    let totalValuation = 0;
    let zeroCostCount = 0;
    const typeValuation: Record<string, number> = {};

    for (const item of stock) {
        const type = item.productVariant.product.productType;
        const qty = item.quantity.toNumber();
        const cost = item.averageCost?.toNumber() || item.productVariant.standardCost?.toNumber() || item.productVariant.buyPrice?.toNumber() || 0;

        if (cost === 0 && qty > 0) zeroCostCount++;

        const val = qty * cost;
        totalValuation += val;
        typeValuation[type] = (typeValuation[type] || 0) + val;
    }

    console.log('\n--- Inventory Valuation by Type ---');
    for (const [type, val] of Object.entries(typeValuation)) {
        console.log(`${type}: Rp ${val.toLocaleString()}`);
    }
    console.log(`Total Physical Valuation: Rp ${totalValuation.toLocaleString()}`);
    console.log(`Items with Quantity but Zero Cost: ${zeroCostCount}`);

    console.log('\n--- Final Comparison ---');
    console.log(`Net Discrepancy (Total GL - Total Valuation): Rp ${(totalGL - totalValuation).toLocaleString()}`);

    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
