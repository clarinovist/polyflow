
/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfill() {
    try {
        const opnames = await prisma.stockOpname.findMany({
            orderBy: { createdAt: 'asc' }
        });

        console.log(`Found ${opnames.length} opnames to backfill.`);

        for (let i = 0; i < opnames.length; i++) {
            const opname = opnames[i];
            const date = new Date(opname.createdAt);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const seq = String(i + 1).padStart(4, '0');
            const code = `OPN-${year}${month}-${seq}`;

            await prisma.stockOpname.update({
                where: { id: opname.id },
                data: { opnameNumber: code }
            });
            console.log(`Updated ${opname.id} to ${code}`);
        }
    } catch (error) {
        console.error("Error backfilling:", error);
    } finally {
        await prisma.$disconnect();
    }
}

backfill();
