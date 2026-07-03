import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Starting script to fix Unbilled Payables and duplicate GRs...");

    const unbilledAccountId = '107c35bb-d941-45a6-a082-7032be2e18e7'; // Unbilled Payables (21120)
    const rawMaterialAccountId = 'd6b05865-b4a8-4495-9e77-5250a9613735'; // Raw Material (11310)

    await prisma.$transaction(async (tx) => {
        // 1. Fix BILL Journal Lines
        // The recent bills debited Raw Materials (11310) when they should have cleared Unbilled Payables (21120).
        const billRefs = ['BILL - 2026 -0008', 'BILL - 2026 -0009', 'BILL - 2026 -0010'];

        for (const ref of billRefs) {
            // Find the JournalEntry
            const je = await tx.journalEntry.findFirst({
                where: { reference: { startsWith: ref } }
            });

            if (je) {
                // Find the line that debited Raw Material
                const badLine = await tx.journalLine.findFirst({
                    where: {
                        journalEntryId: je.id,
                        accountId: rawMaterialAccountId,
                        debit: { gt: 0 }
                    }
                });

                if (badLine) {
                    await tx.journalLine.update({
                        where: { id: badLine.id },
                        data: {
                            accountId: unbilledAccountId,
                            description: 'Clear Unbilled Accrual (Fixed)'
                        }
                    });
                    console.log(`Updated journal line for ${ref} to clear Unbilled Payables.`);
                }
            } else {
                console.log(`Could not find journal entry for ${ref}`);
            }
        }

        // 2. Void Duplicate GRs (GR-2026-0016, GR-2026-0017)
        const duplicateGRs = ['GR-2026-0016', 'GR-2026-0017'];
        for (const grRef of duplicateGRs) {
            const gr = await tx.goodsReceipt.findUnique({
                where: { receiptNumber: grRef },
                include: { items: true }
            });

            if (gr) {
                console.log(`Processing duplicate GR: ${grRef}`);

                // Step A: Reverse the Journal Entry
                const grJe = await tx.journalEntry.findFirst({
                    where: { reference: `GR: ${grRef} for PO` }
                });

                if (grJe) {
                    await tx.journalEntry.update({
                        where: { id: grJe.id },
                        data: { status: 'VOIDED' }
                    });
                    console.log(`Voided journal entry ${grJe.entryNumber}`);
                }

                // Step B: Revert the Inventory Balance
                for (const item of gr.items) {
                    const stock = await tx.inventory.findFirst({
                        where: {
                            locationId: gr.locationId,
                            productVariantId: item.productVariantId
                        }
                    });

                    if (stock) {
                        await tx.inventory.update({
                            where: { id: stock.id },
                            data: { quantity: { decrement: item.receivedQty } }
                        });
                        console.log(`Deducted ${item.receivedQty} from inventory for ${item.productVariantId}`);

                        // Step C: Add a StockMovement to log this deduction
                        await tx.stockMovement.create({
                            data: {
                                type: 'ADJUSTMENT',
                                productVariantId: item.productVariantId,
                                fromLocationId: gr.locationId,
                                quantity: item.receivedQty,
                                reference: `Revert Duplicate GR: ${grRef}`,
                                createdAt: new Date()
                            }
                        });
                    }
                }

                // Note: We leave the GR record in place or we can delete it. 
                // For audit safety, we usually don't delete, but here let's append "VOIDED" to notes.
                await tx.goodsReceipt.update({
                    where: { id: gr.id },
                    data: { notes: 'VOIDED DUE TO DUPLICATION' }
                });

            } else {
                console.log(`Could not find GR: ${grRef}`);
            }
        }
        console.log("Transaction complete.");
    });
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error("Error executing script:", e);
        process.exit(1);
    });
