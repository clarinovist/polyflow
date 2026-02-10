
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    console.log('🚀 Starting Production Financial Sync Migration...');

    // 1. Ensure Unbilled Payables Account exists
    console.log('1. Checking Unbilled Payables (21120) account...');
    const unbilledAcc = await prisma.account.upsert({
        where: { code: '21120' },
        update: {},
        create: {
            code: '21120',
            name: 'Unbilled Payables',
            type: 'LIABILITY',
            category: 'CURRENT_LIABILITY',
            currency: 'IDR',
            isActive: true,
            description: 'Clearing account for Goods Receipts not yet invoiced'
        }
    });

    // 2. Migrate Goods Receipt Journal Credits
    console.log('2. Reclassifying GR journals from 21110 to 21120...');
    const grLines = await prisma.journalLine.findMany({
        where: {
            account: { code: '21110' },
            journalEntry: { referenceType: 'GOODS_RECEIPT' },
            credit: { gt: 0 }
        }
    });

    for (const line of grLines) {
        await prisma.journalLine.update({
            where: { id: line.id },
            data: {
                accountId: unbilledAcc.id,
                description: 'Accrued Payable (Migrated)'
            }
        });
    }
    console.log(`   - Migrated ${grLines.length} GR lines.`);

    // 3. Migrate Purchase Invoice Journal Debits (Clear Unbilled)
    console.log('3. Redirecting Purchase Invoice debits to 21120...');
    const inventoryAccount = await prisma.account.findUnique({ where: { code: '11310' } });
    if (inventoryAccount) {
        const billLines = await prisma.journalLine.findMany({
            where: {
                accountId: inventoryAccount.id,
                journalEntry: { referenceType: 'PURCHASE_INVOICE' },
                debit: { gt: 0 }
            },
            include: { journalEntry: true }
        });

        for (const line of billLines) {
            // Only migrate if it's a standard PO Bill (has PO reference)
            if (line.journalEntry.description.includes('PO-')) {
                await prisma.journalLine.update({
                    where: { id: line.id },
                    data: {
                        accountId: unbilledAcc.id,
                        description: 'Clear Unbilled Accrual (Migrated)'
                    }
                });
            }
        }
        console.log(`   - Migrated ${billLines.length} Bill lines.`);
    }

    // 4. Bulk Post Draft Opening Balances
    console.log('4. Posting DRAFT opening balance journals...');
    const postResult = await prisma.journalEntry.updateMany({
        where: {
            status: 'DRAFT',
            OR: [
                { reference: { startsWith: 'TAG-' } },
                { description: { contains: 'Opening Balance' } }
            ]
        },
        data: { status: 'POSTED' }
    });
    console.log(`   - Posted ${postResult.count} journals.`);

    // 5. Patch specific PO-2026-0002 variance if exists
    console.log('5. Patching Price Variance for PO-2026-0002...');
    const targetJE = await prisma.journalEntry.findFirst({
        where: { reference: { contains: 'GR-2026-0002' }, referenceType: 'GOODS_RECEIPT' },
        include: { lines: true }
    });
    if (targetJE) {
        const liabilityLine = targetJE.lines.find(l => l.credit > 0);
        if (liabilityLine && Number(liabilityLine.credit) !== 24000000) {
            await prisma.journalLine.update({
                where: { id: liabilityLine.id },
                data: { credit: 24000000 }
            });
            console.log('   - Fixed GR-2026-0002 amount to match Bill (24M).');
        }
    }

    console.log('✅ Production Migration Completed.');
    await prisma.$disconnect();
}

run().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
