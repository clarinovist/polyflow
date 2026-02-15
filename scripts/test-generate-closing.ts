
import { PrismaClient } from '@prisma/client';
import { generateClosingEntries } from '@/services/accounting/periods-service';

const prisma = new PrismaClient();

async function main() {
    const period = await prisma.fiscalPeriod.findUnique({
        where: { year_month: { year: 2026, month: 1 } }
    });

    if (!period) {
        console.log('Period Jan 2026 not found');
        return;
    }

    console.log(`Simulating Close for Period: ${period.name}`);
    const SYSTEM_USER_ID = 'system-script';

    // Call the function directly to test logic
    try {
        await generateClosingEntries(period.id, SYSTEM_USER_ID);
        console.log('Successfully generated Closing Entries.');

        // Verify Journal
        const journal = await prisma.journalEntry.findFirst({
            where: { reference: `CLOSE-2026-01` },
            include: { lines: { include: { account: true } } }
        });

        if (journal) {
            console.log(`\nCreated Journal: ${journal.reference} | Date: ${journal.entryDate.toISOString()}`);
            console.log('Lines:');
            journal.lines.forEach(l => {
                console.log(`${l.account.code} (${l.account.name}): Debit ${l.debit}, Credit ${l.credit}`);
            });
        } else {
            console.log('ERROR: Journal not found after generation.');
        }

    } catch (error) {
        console.error('Error generating closing entries:', error);
    }

    process.exit(0);
}

main();
