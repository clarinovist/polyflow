
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const productName = 'ROLL MP KW';
    console.log(`--- Checking Product Type for: "${productName}" ---`);

    const product = await prisma.product.findFirst({
        where: { name: productName },
        include: { variants: true }
    });

    if (!product) {
        console.log('Product not found.');
        return;
    }

    console.log(`Type: ${product.productType}`);
    console.log(`ID: ${product.id}`);
}

main();
