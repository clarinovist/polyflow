
import { PrismaClient, JournalStatus, MovementType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const accountCode = '81100';
    console.log(`\n--- Investigating Account: ${accountCode} ---`);

    const account = await prisma.account.findUnique({
        where: { code: accountCode },
        include: {
            journalLines: {
                include: { journalEntry: true },
                orderBy: { journalEntry: { entryDate: 'desc' } },
                take: 10
            }
        }
    });

    if (!account) {
        console.log(`Account ${accountCode} not found in COA.`);
    } else {
        console.log(`Account Name: ${account.name}`);
        console.log(`Account Type: ${account.type}`);

        if (account.journalLines.length === 0) {
            console.log('No journal entries found for this account.');
        } else {
            console.log('\nRecent Journal Entries:');
            account.journalLines.forEach(line => {
                console.log(`Date: ${line.journalEntry.entryDate.toISOString().split('T')[0]} | Ref: ${line.journalEntry.reference} | Debit: ${line.debit} | Credit: ${line.credit} | Desc: ${line.description}`);
            });
        }
    }

    console.log('\n--- Checking for Stock Adjustment Movements ---');
    const adjustments = await prisma.stockMovement.findMany({
        where: { type: MovementType.ADJUSTMENT },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { productVariant: true }
    });

    if (adjustments.length === 0) {
        console.log('No Stock Adjustment movements found in history.');
    } else {
        adjustments.forEach(m => {
            console.log(`Date: ${m.createdAt.toISOString().split('T')[0]} | Product: ${m.productVariant.name} | Qty: ${m.quantity} | Reason: ${m.reference}`);
        });
    }

    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
