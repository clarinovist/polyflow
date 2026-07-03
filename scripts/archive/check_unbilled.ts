import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const unbilledAccount = await prisma.account.findFirst({
        where: { name: { contains: 'Unbilled Payables', mode: 'insensitive' } }
    });
    
    if (!unbilledAccount) {
        console.log("Account not found");
        return;
    }
    
    console.log(`Found account: ${unbilledAccount.name} (${unbilledAccount.code}) - ID: ${unbilledAccount.id}`);
    
    const lines = await prisma.journalLine.findMany({
        where: { accountId: unbilledAccount.id },
        include: { journalEntry: true }
    });
    
    let totalBalance = 0;
    console.log("Journal Lines:");
    for (const line of lines) {
        // Debits increase Unbilled Payables (it's a liability, so debit decreases it wait. Actually liabilities: credit increases, debit decreases. Let's just sum debit and credit separately.)
        totalBalance += (Number(line.credit) - Number(line.debit));
        console.log(`- ${line.journalEntry?.date?.toISOString().split('T')[0]} | Ref: ${line.journalEntry?.reference} | Debit: ${line.debit} | Credit: ${line.credit} | Net Impact on Liability: ${Number(line.credit) - Number(line.debit)} | Desc: ${line.description}`);
    }
    
    console.log(`\nTotal Balance (Credit - Debit): ${totalBalance}`);
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
