import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const opnameStr = 'SO-2026-0010';
    console.log(`Searching for StockOpname with number: ${opnameStr}`);
    const opname = await prisma.stockOpname.findUnique({
        where: { opnameNumber: opnameStr },
        include: { items: true }
    });

    if (!opname) {
        console.log("NOT FOUND!");
        return;
    }

    console.log("Opname:", JSON.stringify(opname, null, 2));

    const movements = await prisma.stockMovement.findMany({
        where: { reference: opnameStr }
    });

    console.log("Associated Movements:", movements.length);
    console.log(JSON.stringify(movements, null, 2));

    const journals = await prisma.journalEntry.findMany({
        where: { reference: opnameStr }
    });

    console.log("Associated Journals:", journals.length);
    console.log(JSON.stringify(journals, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
