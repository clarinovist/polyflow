const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// These are the accounts and amounts added by OB-CORRECTION
const OB_ACCOUNTS = {
    '11310': 121633987,    // Raw Materials
    '12310': 12107900,     // Recycle Internal (Regrind)
    '12400': 9573115,      // WIP Roll Jumbo
    '12500': 96018016,     // Barang Jadi
};

async function check() {
    console.log('=== DIAGNOSTIC: Double-Count Analysis ===\n');

    for (const [code, obAmount] of Object.entries(OB_ACCOUNTS)) {
        const acc = await prisma.account.findUnique({ where: { code } });
        if (!acc) { console.log(code + ' NOT FOUND'); continue; }

        // Find stock opname adjustment journals hitting this account
        const opnameLines = await prisma.journalLine.findMany({
            where: {
                accountId: acc.id,
                journalEntry: {
                    status: 'POSTED',
                    OR: [
                        { referenceType: 'STOCK_ADJUSTMENT' },
                        { description: { contains: 'ADJUSTMENT' } },
                    ],
                    entryDate: {
                        gte: new Date('2026-02-01'),
                        lte: new Date('2026-02-03')
                    }
                }
            },
            include: { journalEntry: true }
        });

        const totalOpnameDebit = opnameLines.reduce((s, l) => s + Number(l.debit), 0);
        const totalOpnameCredit = opnameLines.reduce((s, l) => s + Number(l.credit), 0);
        const opnameNet = totalOpnameDebit - totalOpnameCredit;

        // Get ALL journals for this account
        const allLines = await prisma.journalLine.findMany({
            where: { accountId: acc.id, journalEntry: { status: 'POSTED' } },
        });
        const totalBalance = allLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);

        console.log('--- ' + code + ' ' + acc.name + ' ---');
        console.log('  OB-CORRECTION amount:  ' + obAmount.toLocaleString());
        console.log('  Stock Opname journals: ' + opnameNet.toLocaleString() + ' (Feb 2 adjustments)');
        console.log('  Overlap (double-count): ' + Math.min(obAmount, opnameNet).toLocaleString());
        console.log('  Current total balance: ' + totalBalance.toLocaleString());
        console.log('  Correct balance would: ' + (totalBalance - Math.min(obAmount, opnameNet)).toLocaleString());
        console.log('');
    }

    // Also check 81100 (Adjustment Gain) total
    const gainAcc = await prisma.account.findUnique({ where: { code: '81100' } });
    if (gainAcc) {
        const gainLines = await prisma.journalLine.findMany({
            where: { accountId: gainAcc.id, journalEntry: { status: 'POSTED' } }
        });
        const gainBalance = gainLines.reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0);
        console.log('--- 81100 Inventory Adjustment Gain ---');
        console.log('  Current balance (revenue): ' + gainBalance.toLocaleString());
        console.log('  After correction: ' + (gainBalance - Object.values(OB_ACCOUNTS).reduce((a, b) => a + b, 0)).toLocaleString());
    }

    process.exit(0);
}

check();
