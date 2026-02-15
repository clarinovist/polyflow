/**
 * Fix Opening Balance — Koreksi Neraca Januari 2026
 * 
 * Script ini membuat jurnal koreksi "OB-CORRECTION" tanggal 31 Jan 2026
 * untuk menyesuaikan saldo akun dengan neraca CPN Januari 2026.
 * 
 * Aman dijalankan ulang: jika OB-CORRECTION sudah ada, akan dihapus dan dibuat ulang.
 * 
 * Usage: node scripts/fix-opening-balance.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const REFERENCE = 'OB-CORRECTION';
const ENTRY_DATE = new Date('2026-01-31T23:59:59.000Z');

async function main() {
    console.log('=== Fix Opening Balance — Neraca Jan 2026 ===\n');

    // 1. Resolve all accounts by code
    const codes = [
        '11300', '12310', '12400', '12500',   // Persediaan
        '21110', '21111',                       // Hutang reklasifikasi
        '31111', '31112', '32000', '30000'     // Modal koreksi
    ];

    const accounts = await prisma.account.findMany({
        where: { code: { in: codes } }
    });

    const byCode = {};
    accounts.forEach(a => { byCode[a.code] = a; });

    // Verify all accounts exist
    const missing = codes.filter(c => !byCode[c]);
    if (missing.length > 0) {
        console.error('ERROR: Akun tidak ditemukan:', missing.join(', '));
        process.exit(1);
    }
    console.log('All accounts found. ✓');

    // 2. Define correction lines (debit positive, credit negative)
    const lines = [
        // ASET — tambah persediaan yang belum ada
        { code: '11300', debit: 121633987, credit: 0, note: 'Persediaan BB' },
        { code: '12310', debit: 12107900, credit: 0, note: 'Persediaan BB Affal (Regrind)' },
        { code: '12400', debit: 9573115, credit: 0, note: 'Persediaan BSJ (WIP)' },
        { code: '12500', debit: 96018016, credit: 0, note: 'Persediaan BJ (Barang Jadi)' },
        // HUTANG — reklasifikasi maklun dari 21110 ke 21111
        { code: '21110', debit: 8773200, credit: 0, note: 'Reklasifikasi ke Hutang Maklun' },
        { code: '21111', debit: 0, credit: 8773200, note: 'Hutang Maklun dari neraca' },
        // MODAL — pecah Retained Earnings ke Laba Ditahan + Laba Berjalan
        { code: '32000', debit: 89095785, credit: 0, note: 'Koreksi: seharusnya 0' },
        { code: '31111', debit: 0, credit: 50325445, note: 'Laba/Rugi Ditahan dari neraca' },
        { code: '31112', debit: 0, credit: 38770340, note: 'Laba/Rugi Berjalan dari neraca' },
        // Opening Balance Equity — zero out saldo negatif
        { code: '30000', debit: 0, credit: 239333018, note: 'Zero out OBE' },
    ];

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

    console.log('Total Debit : ' + totalDebit.toLocaleString());
    console.log('Total Credit: ' + totalCredit.toLocaleString());

    if (totalDebit !== totalCredit) {
        console.error('ERROR: Debit !== Credit. Jurnal tidak balance.');
        process.exit(1);
    }
    console.log('Balance check passed. ✓\n');

    // 3. Execute in transaction
    await prisma.$transaction(async (tx) => {
        // Delete existing correction if re-running
        const existing = await tx.journalEntry.findFirst({
            where: { reference: REFERENCE }
        });
        if (existing) {
            await tx.journalLine.deleteMany({ where: { journalEntryId: existing.id } });
            await tx.journalEntry.delete({ where: { id: existing.id } });
            console.log('Deleted existing OB-CORRECTION entry. ✓');
        }

        // Generate next entry number
        const lastEntry = await tx.journalEntry.findFirst({
            orderBy: { entryNumber: 'desc' },
            select: { entryNumber: true }
        });
        const lastNum = lastEntry ? parseInt(lastEntry.entryNumber.replace(/\D/g, '')) : 0;
        const entryNumber = 'JE-2026-' + String(lastNum + 1).padStart(5, '0');

        // Create the correction journal entry
        const entry = await tx.journalEntry.create({
            data: {
                entryDate: ENTRY_DATE,
                entryNumber,
                reference: REFERENCE,
                description: 'Koreksi Opening Balance — Neraca CPN Januari 2026',
                status: 'POSTED',
                lines: {
                    create: lines.map(l => ({
                        accountId: byCode[l.code].id,
                        debit: l.debit,
                        credit: l.credit,
                        description: l.note,
                    }))
                }
            }
        });

        console.log('Created OB-CORRECTION: ' + entry.id + ' ✓');
        console.log('Date: ' + entry.entryDate.toISOString().slice(0, 10));
        console.log('Status: ' + entry.status);
        console.log('Lines: ' + lines.length);
    });

    console.log('\n=== DONE ===');
    console.log('Opening balance berhasil dikoreksi sesuai neraca Januari 2026.');
    console.log('Jalankan "node scripts/check-ob.js" untuk verifikasi.');

    process.exit(0);
}

main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
