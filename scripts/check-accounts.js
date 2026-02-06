const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const accounts = await prisma.account.findMany({
        orderBy: { code: 'asc' }
    });

    console.log('Total Accounts:', accounts.length);
    accounts.forEach(acc => {
        console.log(`${acc.code} ${acc.name} (${acc.type} / ${acc.category})`);
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
