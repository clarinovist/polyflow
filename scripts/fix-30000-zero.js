const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('=== Voiding REVERSAL-JAN-OP to zero out 30000 ===\n');

    const entry = await prisma.journalEntry.findFirst({
        where: { reference: 'REVERSAL-JAN-OP', status: 'POSTED' }
    });

    if (entry) {
        await prisma.journalEntry.update({
            where: { id: entry.id },
            data: { status: 'VOIDED' }
        });
        console.log('VOIDED: REVERSAL-JAN-OP | ' + entry.description);
    } else {
        console.log('REVERSAL-JAN-OP not found or already voided');
    }

    // Check final 30000 balance
    const acc = await prisma.account.findUnique({ where: { code: '30000' } });
    const lines = await prisma.journalLine.findMany({
        where: { accountId: acc.id, journalEntry: { status: 'POSTED' } }
    });
    const bal = lines.reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0);
    console.log('\nFinal 30000 balance: ' + bal.toLocaleString());

    process.exit(0);
}

main();
