const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    // Find opening balance entries
    const entries = await prisma.journalEntry.findMany({
        where: {
            OR: [
                { reference: { startsWith: 'OB-' } },
                { reference: { contains: 'OPENING' } },
                { reference: { contains: 'opening' } },
                { description: { contains: 'opening' } },
                { description: { contains: 'Opening' } },
                { description: { contains: 'saldo awal' } },
            ]
        },
        include: { lines: { include: { account: true } } }
    });

    if (entries.length > 0) {
        entries.forEach(e => {
            console.log('=== ' + e.reference + ' | ' + e.entryDate.toISOString().slice(0, 10) + ' | ' + e.status);
            e.lines.forEach(l => console.log('  ' + l.account.code + ' ' + l.account.name + ' | D:' + Number(l.debit).toLocaleString() + ' C:' + Number(l.credit).toLocaleString()));
        });
    } else {
        console.log('No opening balance entries found by reference/description.');
        console.log('\nFirst 10 journal entries by date:');
        const first = await prisma.journalEntry.findMany({
            orderBy: { entryDate: 'asc' },
            take: 10,
            include: { lines: { include: { account: true } } }
        });
        first.forEach(e => {
            console.log('\n=== ' + e.reference + ' | ' + e.entryDate.toISOString().slice(0, 10) + ' | ' + e.status + ' | ' + (e.description || ''));
            e.lines.forEach(l => console.log('  ' + l.account.code + ' ' + l.account.name + ' | D:' + Number(l.debit).toLocaleString() + ' C:' + Number(l.credit).toLocaleString()));
        });
    }

    // Also get current balances for all neraca accounts as of Jan 31
    console.log('\n\n=== SALDO AKUN PER 31 JAN 2026 ===');
    const codes = ['11100', '11130', '11200', '11211', '11212', '11300', '12100', '12310', '12400', '12500', '21110', '21111', '21112', '30000', '31000', '31110', '31111', '31112', '32000', '33000'];
    const accounts = await prisma.account.findMany({
        where: { code: { in: codes } },
        include: {
            journalLines: {
                where: {
                    journalEntry: {
                        entryDate: { lte: new Date('2026-01-31T23:59:59Z') },
                        status: 'POSTED'
                    }
                }
            }
        }
    });

    accounts.sort((a, b) => a.code.localeCompare(b.code));
    accounts.forEach(a => {
        const isDebitNormal = ['ASSET', 'EXPENSE'].includes(a.type);
        const bal = a.journalLines.reduce((s, l) => {
            const val = Number(l.debit) - Number(l.credit);
            return s + (isDebitNormal ? val : -val);
        }, 0);
        if (Math.abs(bal) > 0.01) {
            console.log(a.code + ' ' + a.name + ' (' + a.type + ') = ' + bal.toLocaleString());
        }
    });

    process.exit(0);
}

check();
