import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Starting fix for Unbilled Payables on BILL - 2026 -0011...");

    const RAW_MATERIAL_ACCOUNT_ID = 'd6b05865-b4a8-4495-9e77-5250a9613735'; // 11310
    const UNBILLED_ACCOUNT_ID = '107c35bb-d941-45a6-a082-7032be2e18e7'; // 21120
    const JOURNAL_ENTRY_ID = '9e9ad757-1ca5-455e-becc-f111a9a4e9b3'; // BILL - 2026 -0011

    await prisma.$transaction(async (tx) => {
        // Find the line that debited Raw Material (11310) in the BILL
        const badLine = await tx.journalLine.findFirst({
            where: {
                journalEntryId: JOURNAL_ENTRY_ID,
                accountId: RAW_MATERIAL_ACCOUNT_ID,
                debit: { gt: 0 }
            }
        });

        if (badLine) {
            console.log(`Found bad journal line: ${badLine.id} debited ${badLine.debit} to 11310.`);

            // Update it to debit Unbilled Payables (21120) instead
            await tx.journalLine.update({
                where: { id: badLine.id },
                data: {
                    accountId: UNBILLED_ACCOUNT_ID,
                    description: 'Clear Unbilled Accrual (Fixed by Script)'
                }
            });
            console.log(`Successfully updated journal line to clear Unbilled Payables (21120).`);

            // Verify the balance
            const unbilledBalanceRows = await tx.$queryRaw`
                SELECT SUM(credit - debit) as balance 
                FROM "JournalLine" 
                WHERE "accountId" = ${UNBILLED_ACCOUNT_ID}
            `;
            
            console.log(`New Unbilled Payables balance:`, unbilledBalanceRows);
        } else {
            console.log("Could not find the bad journal line to fix.");
        }
    });
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error("Error executing script:", e);
        process.exit(1);
    });
