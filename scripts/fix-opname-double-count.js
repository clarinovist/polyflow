const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const REFERENCE = 'OB-OPNAME-ADJ';
const ENTRY_DATE = new Date('2026-02-02T00:00:00.000Z'); // Same date as stock opname
const CORRECTION_AMOUNT = 121633987; // OB-CORRECTION amount for 11310

async function main() {
    console.log('=== Fix Stock Opname Double-Count ===\n');

    await prisma.$transaction(async (tx) => {
        // 1. Delete existing correction if re-running
        const existing = await tx.journalEntry.findFirst({
            where: { reference: REFERENCE }
        });
        if (existing) {
            await tx.journalLine.deleteMany({ where: { journalEntryId: existing.id } });
            await tx.journalEntry.delete({ where: { id: existing.id } });
            console.log('Deleted existing ' + REFERENCE + ' entry. ✓');
        }

        // 2. Resolve accounts
        const acc11310 = await tx.account.findUnique({ where: { code: '11310' } });
        const acc81100 = await tx.account.findUnique({ where: { code: '81100' } });
        if (!acc11310 || !acc81100) throw new Error('Account 11310 or 81100 not found');

        // 3. Generate unique entry number
        const entryNumber = 'ADJ-' + Date.now();

        // 4. Find userId from existing entry
        const refEntry = await tx.journalEntry.findFirst({ select: { createdById: true } });
        if (!refEntry) throw new Error('No journal entries found');

        // 5. Create corrective journal
        // Logic: Stock opname on Feb 2 added full physical value to 11310 (from zero)
        //        OB-CORRECTION also added 121M to 11310 for Jan neraca
        //        This correction reverses the overlapping 121M from stock opname gain
        const entry = await tx.journalEntry.create({
            data: {
                entryDate: ENTRY_DATE,
                entryNumber,
                reference: REFERENCE,
                description: 'Koreksi double-count: OB persediaan BB vs Stock Opname Feb 2',
                status: 'POSTED',
                createdById: refEntry.createdById,
                lines: {
                    create: [
                        {
                            accountId: acc81100.id,
                            debit: CORRECTION_AMOUNT,
                            credit: 0,
                            description: 'Reverse inflated adjustment gain (OB overlap)'
                        },
                        {
                            accountId: acc11310.id,
                            debit: 0,
                            credit: CORRECTION_AMOUNT,
                            description: 'Reverse double-counted Raw Material from OB + Opname'
                        }
                    ]
                }
            }
        });

        console.log('Created ' + REFERENCE + ': ' + entry.id + ' ✓');
        console.log('Date: ' + ENTRY_DATE.toISOString().slice(0, 10));
        console.log('Amount: Rp ' + CORRECTION_AMOUNT.toLocaleString());
        console.log('  Debit  81100 (reduce gain): ' + CORRECTION_AMOUNT.toLocaleString());
        console.log('  Credit 11310 (reduce inventory): ' + CORRECTION_AMOUNT.toLocaleString());
    });

    // 6. Verify final balance
    const acc = await prisma.account.findUnique({ where: { code: '11310' } });
    const allLines = await prisma.journalLine.findMany({
        where: { accountId: acc.id, journalEntry: { status: 'POSTED' } }
    });
    const finalBal = allLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    console.log('\nFinal 11310 balance: Rp ' + finalBal.toLocaleString());

    console.log('\n=== DONE ===');
    process.exit(0);
}

main();
