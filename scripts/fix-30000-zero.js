const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('=== FINAL CLEANUP: Zeroing out Account 30000 ===\n');

    const acc30000 = await prisma.account.findUnique({ where: { code: '30000' } });
    if (!acc30000) { console.log('Account 30000 not found'); process.exit(1); }

    // Search for all POSTED journal entries on account 30000, except our correction (OB-CORRECTION)
    const lines = await prisma.journalLine.findMany({
        where: {
            accountId: acc30000.id,
            journalEntry: {
                status: 'POSTED',
                NOT: { reference: 'OB-CORRECTION' }
            }
        },
        include: { journalEntry: true }
    });

    const entryIds = [...new Set(lines.map(l => l.journalEntryId))];

    if (entryIds.length === 0) {
        console.log('Tidak ada transaksi lain yang perlu di-void. Saldo harusnya sudah nol.');
    } else {
        for (const id of entryIds) {
            const entry = await prisma.journalEntry.update({
                where: { id },
                data: { status: 'VOIDED' }
            });
            console.log('VOIDED: ' + (entry.reference || 'MANUAL') + ' | ' + (entry.description || 'No description'));
        }
        console.log('\nBerhasil void ' + entryIds.length + ' entry tambahan.');
    }

    // Final balance check
    const finalLines = await prisma.journalLine.findMany({
        where: { accountId: acc30000.id, journalEntry: { status: 'POSTED' } }
    });
    const bal = finalLines.reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0);
    console.log('Final 30000 balance: ' + bal.toLocaleString());

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
