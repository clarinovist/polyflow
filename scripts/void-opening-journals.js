
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * PRODUCTION VOID SCRIPT
 * Purpose: Safe automation to void orphaned "Opening Balance" journals.
 */
async function run() {
    console.log('--- STARTING OPENING BALANCE VOID ---');

    try {
        const accounts = await prisma.account.findMany({
            where: { code: { in: ['11210', '21110'] } }
        });

        // Find all POSTED journals with "Opening Balance" in description for AR/AP
        const journalsToVoid = await prisma.journalEntry.findMany({
            where: {
                status: 'POSTED',
                description: { contains: 'Opening Balance' },
                lines: {
                    some: {
                        accountId: { in: accounts.map(a => a.id) }
                    }
                }
            }
        });

        if (journalsToVoid.length === 0) {
            console.log('No "Opening Balance" journals found to void.');
            return;
        }

        console.log(`Found ${journalsToVoid.length} journals to void.`);
        journalsToVoid.forEach(j => console.log(`- Voiding: ${j.entryNumber} (${j.description})`));

        // Process update
        const result = await prisma.journalEntry.updateMany({
            where: {
                id: { in: journalsToVoid.map(j => j.id) }
            },
            data: {
                status: 'VOIDED'
            }
        });

        console.log(`\nSUCCESS: ${result.count} journals have been VOIDED.`);
        console.log('You can now use the Opening Balance Wizard to input clean details.');

    } catch (error) {
        console.error('ERROR during void:', error);
    } finally {
        await prisma.$disconnect();
    }
}

run();
