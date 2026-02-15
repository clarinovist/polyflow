const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
    const acc = await p.account.findUnique({
        where: { code: '30000' },
        include: {
            journalLines: {
                where: { journalEntry: { status: 'POSTED' } },
                include: { journalEntry: { select: { reference: true, entryDate: true } } }
            }
        }
    });
    if (!acc) { console.log('30000 not found'); process.exit(0); }
    let bal = 0;
    acc.journalLines.forEach(l => {
        const net = Number(l.credit) - Number(l.debit);
        bal += net;
        console.log(l.journalEntry.reference + ' | ' + l.journalEntry.entryDate.toISOString().slice(0, 10) + ' | D:' + Number(l.debit).toLocaleString() + ' C:' + Number(l.credit).toLocaleString());
    });
    console.log('\nSaldo 30000: ' + bal.toLocaleString());
    process.exit(0);
})();
