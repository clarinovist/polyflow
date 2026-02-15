
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const targetNames = [
        'HD HIJAU REGULER',
        'HD UNGU',
        'HPR',
        'PG OZ',
        'HD JUMBO'
    ];

    console.log('--- Checking for Product Variants (Roll vs Bag) ---');

    for (const name of targetNames) {
        console.log(`\nbase: ${name}`);
        // Check for similar names
        const similar = await prisma.product.findMany({
            where: {
                name: { contains: name }
            },
            select: { name: true, productType: true }
        });

        similar.forEach(p => console.log(`  - ${p.name} [${p.productType}]`));
    }
}

main();
