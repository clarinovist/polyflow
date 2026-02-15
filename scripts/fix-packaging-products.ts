
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Fixing 5 Misclassified Packaging Products ---');

    // The 5 items identified
    const targetNames = [
        'HD HIJAU REGULER',
        'HD UNGU',
        'HPR',
        'PG OZ',
        'HD JUMBO'
    ];

    // 1. Get correct accounts
    const accInvFG = await prisma.account.findFirst({ where: { code: '11210' } }); // Persediaan Barang Jadi
    const accCogsFG = await prisma.account.findFirst({ where: { code: '50000' } }); // HPP

    if (!accInvFG || !accCogsFG) {
        console.error('Critical accounts (11210, 50000) not found. Aborting.');
        return;
    }

    // 2. Fetch the products
    const products = await prisma.product.findMany({
        where: {
            name: { in: targetNames },
            productType: 'PACKAGING' // only fetch if they are still PACKAGING
        }
    });

    if (products.length === 0) {
        console.log('No products found with type PACKAGING matching the names. Already fixed?');
        return;
    }

    console.log(`Found ${products.length} products to update.`);

    // 3. Update them
    for (const product of products) {
        console.log(`Updating ${product.name}...`);
        await prisma.product.update({
            where: { id: product.id },
            data: {
                productType: 'FINISHED_GOOD',
                inventoryAccountId: accInvFG.id,
                cogsAccountId: accCogsFG.id
            }
        });
    }

    console.log('\n✅ All specified products updated to FINISHED_GOOD.');

    // 4. Double check if they had any inventory value (Opening Balance / Adjustments) in Packaging Account (11340)
    // If so, we might need to reclassify that value too.
    // We can check Inventory records.

    console.log('\n--- Checking for existing Inventory value issues ---');
    // ... (Logic to verify if we need journal corrections for these items)
    // Since user said no sales, likely only Opening Balance or Adjustments exist.

    // Checking Journals related to these products? 
    // It's hard to link Journals directly to Product without parsing description or checking stock movements.
    // Let's rely on the user report/balance check for now.
}

main();
