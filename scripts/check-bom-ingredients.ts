
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const productName = 'HD TRANS REGULER';
    console.log(`--- Checking BOM Ingredients for: "${productName}" ---`);

    const product = await prisma.product.findFirst({
        where: { name: productName },
        include: { variants: true }
    });

    if (!product || product.variants.length === 0) {
        console.log('Product or Variant not found.');
        return;
    }

    const variantId = product.variants[0].id;

    const boms = await prisma.bom.findMany({
        where: { productVariantId: variantId },
        include: {
            items: {
                include: {
                    productVariant: {
                        include: { product: true }
                    }
                }
            }
        }
    });

    if (boms.length === 0) {
        console.log('No BOM found.');
        return;
    }

    for (const bom of boms) {
        console.log(`\nBOM Name: ${bom.name} (Default: ${bom.isDefault})`);
        console.log('Ingredients:');
        for (const item of bom.items) {
            console.log(`- ${item.productVariant.product.name} (${item.quantity} ${item.productVariant.primaryUnit})`);
        }
    }
}

main();
