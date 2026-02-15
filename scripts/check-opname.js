const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    // 1. Check stock opname sessions
    console.log('=== STOCK OPNAME SESSIONS ===');
    const sessions = await prisma.stockOpname.findMany({
        orderBy: { createdAt: 'asc' },
        include: { location: true }
    });
    sessions.forEach(s => {
        console.log(s.opnameNumber + ' | ' + s.createdAt.toISOString().slice(0, 10) + ' | ' + s.status + ' | ' + (s.location?.name || 'unknown'));
    });

    // 2. Check ADJUSTMENT stock movements
    console.log('\n=== ADJUSTMENT STOCK MOVEMENTS ===');
    const movements = await prisma.stockMovement.findMany({
        where: { type: 'ADJUSTMENT' },
        orderBy: { createdAt: 'asc' },
        include: { productVariant: { include: { product: true } } }
    });
    movements.forEach(m => {
        console.log(m.reference + ' | ' + m.createdAt.toISOString().slice(0, 10) + ' | qty:' + Number(m.quantity) + ' | ' + m.productVariant?.name);
    });

    // 3. Check journal entries that reference stock adjustments or opname
    console.log('\n=== ADJUSTMENT JOURNALS (hitting inventory accounts) ===');
    const journals = await prisma.journalEntry.findMany({
        where: {
            OR: [
                { referenceType: 'STOCK_ADJUSTMENT' },
                { description: { contains: 'ADJUSTMENT' } },
                { reference: { contains: 'OPN' } },
            ]
        },
        orderBy: { entryDate: 'asc' },
        include: {
            lines: {
                include: { account: true },
                where: {
                    account: {
                        code: { in: ['11310', '11300', '11320', '11330', '11340', '11350', '12310', '12400', '12500', '81100', '91100'] }
                    }
                }
            }
        }
    });

    let totalAdjDebit = 0;
    let totalAdjCredit = 0;
    journals.forEach(j => {
        if (j.lines.length > 0) {
            console.log('\n' + j.reference + ' | ' + j.entryDate.toISOString().slice(0, 10) + ' | ' + j.status);
            j.lines.forEach(l => {
                const d = Number(l.debit);
                const c = Number(l.credit);
                console.log('  ' + l.account.code + ' ' + l.account.name + ' | D:' + d.toLocaleString() + ' C:' + c.toLocaleString());
                if (l.account.code === '11310') { totalAdjDebit += d; totalAdjCredit += c; }
            });
        }
    });

    console.log('\n=== TOTAL 11310 dari adjustment journals ===');
    console.log('Total Debit (masuk):  ' + totalAdjDebit.toLocaleString());
    console.log('Total Credit (keluar): ' + totalAdjCredit.toLocaleString());
    console.log('Net tambahan:          ' + (totalAdjDebit - totalAdjCredit).toLocaleString());

    // 4. Full 11310 balance breakdown
    console.log('\n=== SEMUA JURNAL YANG MENYENTUH 11310 ===');
    const acc = await prisma.account.findUnique({ where: { code: '11310' } });
    if (acc) {
        const allLines = await prisma.journalLine.findMany({
            where: { accountId: acc.id, journalEntry: { status: 'POSTED' } },
            include: { journalEntry: true },
            orderBy: { journalEntry: { entryDate: 'asc' } }
        });
        let running = 0;
        allLines.forEach(l => {
            const net = Number(l.debit) - Number(l.credit);
            running += net;
            console.log(
                l.journalEntry.entryDate.toISOString().slice(0, 10) + ' | ' +
                l.journalEntry.reference + ' | D:' + Number(l.debit).toLocaleString() +
                ' C:' + Number(l.credit).toLocaleString() + ' | Running: ' + running.toLocaleString()
            );
        });
        console.log('Final balance 11310: ' + running.toLocaleString());
    }

    process.exit(0);
}

check();
