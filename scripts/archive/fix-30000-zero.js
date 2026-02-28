/**
 * RECOVERY SCRIPT — Restore voided opening balance entries
 * 
 * fix-30000-zero.js incorrectly voided ALL entries touching 30000.
 * This script restores the original OB entries and only voids the specific
 * problematic entries (manual entries from Feb 15 + REVERSAL-JAN-OP).
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('=== RECOVERY: Restoring voided Opening Balance entries ===\n');

    // Step 1: Restore ALL opening balance entries that were incorrectly voided
    const toRestore = await prisma.journalEntry.findMany({
        where: {
            status: 'VOIDED',
            OR: [
                { reference: { startsWith: 'TAG-' } },
                { reference: { startsWith: 'TAg-' } },
                { reference: { startsWith: 'INVV-' } },
                { reference: { startsWith: 'BILL-' } },
                { reference: { startsWith: 'BILL_' } },
                { reference: 'OPENING-GEN' },
            ]
        }
    });

    for (const entry of toRestore) {
        await prisma.journalEntry.update({
            where: { id: entry.id },
            data: { status: 'POSTED' }
        });
        console.log('RESTORED: ' + (entry.reference || 'NO REF') + ' | ' + entry.description);
    }
    console.log('\nRestored ' + toRestore.length + ' entries.\n');

    // Step 2: Void ONLY the specific problematic entries
    // These are: REVERSAL-JAN-OP + manual entries from Feb 15 (Pemutihan, Mindahin)
    const acc30000 = await prisma.account.findUnique({ where: { code: '30000' } });
    const problemLines = await prisma.journalLine.findMany({
        where: {
            accountId: acc30000.id,
            journalEntry: {
                status: 'POSTED',
                entryDate: { gte: new Date('2026-02-01') },
                NOT: [
                    { reference: 'OB-CORRECTION' },
                    { reference: 'OB-OPNAME-ADJ' },
                ]
            }
        },
        include: { journalEntry: true }
    });

    const problemIds = [...new Set(problemLines.map(l => l.journalEntryId))];
    for (const id of problemIds) {
        const entry = await prisma.journalEntry.update({
            where: { id },
            data: { status: 'VOIDED' }
        });
        console.log('VOIDED: ' + (entry.reference || 'MANUAL') + ' | ' + entry.description);
    }
    console.log('\nVoided ' + problemIds.length + ' problematic entries.\n');

    // Step 3: Final balance check
    const finalLines = await prisma.journalLine.findMany({
        where: { accountId: acc30000.id, journalEntry: { status: 'POSTED' } }
    });
    const bal = finalLines.reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0);
    console.log('Final 30000 balance: ' + bal.toLocaleString());

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
