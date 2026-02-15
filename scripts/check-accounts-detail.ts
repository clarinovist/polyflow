
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const invId = 'acb1edd2-ce9b-429a-a277-e2fd97b7826b';
    const cogsId = '9f89ca4a-4d0a-459c-926b-b35e0bdb9cd9';

    const type = (await prisma.product.findFirst({ where: { name: 'HD TRANS REGULER' } }))?.productType;
    console.log(`Product Type: ${type}`);

    const accounts = await prisma.account.findMany({
        where: { id: { in: [invId, cogsId] } }
    });

    accounts.forEach(a => {
        console.log(`${a.id} -> ${a.code} : ${a.name}`);
    });
}

main();
