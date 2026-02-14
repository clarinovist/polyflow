
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Searching for duplicate Opening Balance entries...');

    const entries = await prisma.journalEntry.findMany({
        where: {
            reference: 'OPENING-GEN',
            description: { contains: 'General Opening Balance' }
        },
        orderBy: { createdAt: 'desc' },
        include: { lines: true }
    });

    console.log(`Found ${entries.length} entries.`);

    if (entries.length < 2) {
        console.log('Less than 2 entries found. Nothing to reduce.');
        return;
    }

    const toDelete = entries.slice(0, entries.length - 1); // Delete all except the last one (oldest)

    console.log(`Deleting ${toDelete.length} duplicate entries...`);

    for (const entry of toDelete) {
        console.log(`Deleting Entry ID: ${entry.id} (Date: ${entry.entryDate.toISOString()})`);

        // Delete lines first
        await prisma.journalLine.deleteMany({
            where: { journalEntryId: entry.id }
        });

        // Delete entry
        await prisma.journalEntry.delete({
            where: { id: entry.id }
        });
    }

    console.log('Deletion complete.');

    // Check remaining
    const remaining = await prisma.journalEntry.findMany({
        where: {
            reference: 'OPENING-GEN'
        }
    });

    console.log(`Remaining entries: ${remaining.length}`);
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
