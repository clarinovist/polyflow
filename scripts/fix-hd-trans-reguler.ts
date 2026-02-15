
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const productName = 'HD TRANS REGULER';
    console.log(`--- Fixing Product: "${productName}" ---`);

    // 1. Get Product and needed Accounts
    const product = await prisma.product.findFirst({
        where: { name: productName }
    });

    if (!product) {
        console.log('Product not found.');
        return;
    }

    const accInvFG = await prisma.account.findFirst({ where: { code: '11210' } }); // Persediaan Barang Jadi
    const accCogsFG = await prisma.account.findFirst({ where: { code: '50000' } }); // HPP

    const accInvPack = await prisma.account.findFirst({ where: { code: '11340' } }); // Packaging Materials (Current Wrong)
    const accCogsPack = await prisma.account.findFirst({ where: { code: '51700' } }); // Kemasan Produk (Current Wrong)

    if (!accInvFG || !accCogsFG || !accInvPack || !accCogsPack) {
        console.error('Critical accounts not found. Aborting.');
        console.log('11210:', accInvFG?.id);
        console.log('50000:', accCogsFG?.id);
        console.log('11340:', accInvPack?.id);
        console.log('51700:', accCogsPack?.id);
        return;
    }

    // 2. Update Product Type & Accounts
    console.log(`\nUpdating Product Type to FINISHED_GOOD...`);
    await prisma.product.update({
        where: { id: product.id },
        data: {
            productType: 'FINISHED_GOOD',
            inventoryAccountId: accInvFG.id,
            cogsAccountId: accCogsFG.id
        }
    });
    console.log('Product updated successfully.');

    // 3. Find the Shipment Journal to Correction
    const shipmentRef = 'Shipment for SO-2026-0001';
    const originalJournal = await prisma.journalEntry.findFirst({
        where: { reference: shipmentRef }
    });

    if (!originalJournal) {
        console.log(`Original Journal "${shipmentRef}" not found. Skipping correction.`);
        return;
    }

    // Check if correction already exists
    const correctionRef = `CORRECTION-${shipmentRef}`;
    const existingCorrection = await prisma.journalEntry.findFirst({
        where: { reference: correctionRef }
    });

    if (existingCorrection) {
        console.log('Correction journal already exists.');
        return;
    }

    console.log(`\nCreating Reclassification Journal...`);
    // Amount from previous investigation: 24,676,397.62
    // We need to fetch the exact amount from the lines to be safe
    const lineInvPack = await prisma.journalLine.findFirst({
        where: { journalEntryId: originalJournal.id, accountId: accInvPack.id }
    });

    if (!lineInvPack) {
        console.log('Could not find original Credit line to 11340 inside the journal. Skipping correction.');
        return; // Maybe it used a different account?
    }

    const amount = Number(lineInvPack.credit);
    console.log(`Amount to reclassify: ${amount.toLocaleString()}`);

    /*
      Correction Logic:
      1. Reverse usage of Packaging:
         Dr 11340 (Inventory Packaging)  +Amount
         Cr 51700 (COGS Packaging)       -Amount  (Actually usually we credit COGS directly)
  
      2. Record usage of FG:
         Dr 50000 (COGS FG)              +Amount
         Cr 11210 (Inventory FG)         -Amount
         
      Combined Entry:
      Dr 11340 (Inv Pack)   24M
      Dr 50000 (COGS FG)    24M
      Cr 51700 (COGS Pack)  24M
      Cr 11210 (Inv FG)     24M
    */

    await prisma.journalEntry.create({
        data: {
            entryNumber: correctionRef,
            entryDate: new Date(), // Today
            reference: correctionRef,
            description: `Correction for Misclassified Shipment (Packaging -> FG)`,
            status: 'POSTED',
            createdById: originalJournal.createdById, // Use same user or system
            lines: {
                create: [
                    {
                        accountId: accInvPack.id, // Debit 11340 to fix negative balance
                        debit: amount,
                        description: 'Reclass: Return Packaging Stock'
                    },
                    {
                        accountId: accCogsFG.id, // Debit 50000 for correct COGS
                        debit: amount,
                        description: 'Reclass: Charge correct COGS'
                    },
                    {
                        accountId: accCogsPack.id, // Credit 51700 to zero out wrong COGS
                        credit: amount,
                        description: 'Reclass: Reverse wrong COGS'
                    },
                    {
                        accountId: accInvFG.id, // Credit 11210 (will go negative if no stock, but correct process)
                        credit: amount,
                        description: 'Reclass: Deduct FG Stock'
                    }
                ]
            }
        }
    });

    console.log('Correction Journal Created Successfully.');
}

main();
