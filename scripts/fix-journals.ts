import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Starting script to fix Production Output Trade Receivables issue...");

    const wrongAccountId = '3d0a83d0-6286-4166-9b6e-8700f4fc195c'; // Trade Receivables (AR)
    const correctAccountId = await prisma.account.findFirst({
        where: { code: '11340' } // Barang Jadi - Pack/Kresek
    });
    const correctId = correctAccountId?.id;

    if (!correctId) {
        console.error("Account 11340 not found.");
        return;
    }

    // 1. Fix Product records
    const products = await prisma.product.findMany({
        where: { inventoryAccountId: wrongAccountId }
    });

    console.log(`Found ${products.length} Products with incorrect inventory account (Trade Receivables).`);

    for (const prod of products) {
        await prisma.product.update({
            where: { id: prod.id },
            data: { inventoryAccountId: correctId }
        });
        console.log(`Updated Product: ${prod.name}`);
    }

    // 2. Fix Historical Journal Lines
    const journalLines = await prisma.journalLine.findMany({
        where: { accountId: wrongAccountId },
        include: { journalEntry: true }
    });

    const linesToFix = journalLines.filter(line =>
        line.journalEntry.description.includes('Production Output')
    );

    console.log(`Found ${linesToFix.length} JournalLines erroneously hitting Trade Receivables for Production Output.`);

    for (const line of linesToFix) {
        await prisma.journalLine.update({
            where: { id: line.id },
            data: { accountId: correctId }
        });
        console.log(`Updated Journal Line ${line.id} (Entry: ${line.journalEntry.entryNumber})`);
    }

    console.log("Fix completed successfully.");
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
