
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("--- Inspecting Raw Journal Entries for Jan 2026 ---");
    const startDate = new Date('2026-01-01T00:00:00.000Z');
    const endDate = new Date('2026-01-31T23:59:59.999Z');

    const journals = await prisma.journalEntry.findMany({
        where: {
            entryDate: {
                gte: startDate,
                lte: endDate
            }
        },
        include: {
            lines: {
                include: { account: true }
            }
        },
        take: 5
    });

    console.log(`Found ${journals.length} journals in date range.`);

    for (const j of journals) {
        console.log(`ID: ${j.id} | Date: ${j.entryDate.toISOString()} | Status: ${j.status} | Ref: ${j.reference}`);
        for (const l of j.lines) {
            console.log(`  - Acc: ${l.account.code} (${l.account.type}) | Dr: ${l.debit} | Cr: ${l.credit}`);
        }
    }
}

main();
