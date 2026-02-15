
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking for Closing Journal Entries in Jan 2026 ---');

    // Look for journals that might be related to closing
    // 1. Check for Reference 'CLOSING' or similar
    const closingJournals = await prisma.journalEntry.findMany({
        where: {
            entryDate: {
                gte: new Date('2026-01-31T00:00:00.000Z'),
                lte: new Date('2026-02-01T23:59:59.999Z')
            },
            OR: [
                { reference: { contains: 'CLOSE', mode: 'insensitive' } },
                { description: { contains: 'Closing', mode: 'insensitive' } }
            ]
        },
        include: { lines: true }
    });

    if (closingJournals.length === 0) {
        console.log('NO Closing Journal Entries found for Jan 31 - Feb 1 2026.');
    } else {
        console.log(`Found ${closingJournals.length} potential closing entries:`);
        closingJournals.forEach(j => {
            console.log(`ID: ${j.id} | Ref: ${j.reference} | Desc: ${j.description}`);
        });
    }

    // 2. Check Fiscal Period Status again
    const period = await prisma.fiscalPeriod.findUnique({
        where: { year_month: { year: 2026, month: 1 } }
    });
    console.log(`\nJan 2026 Period Status: ${period?.status}`);

    process.exit(0);
}

main().catch(console.error);
