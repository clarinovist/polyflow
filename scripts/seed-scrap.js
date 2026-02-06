
const { PrismaClient, ProductType, Unit } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Seeding missing scrap variants...');

    const scrapTypes = [
        {
            productName: 'Affal Prongkol',
            variantName: 'Affal Prongkol',
            skuCode: 'SCRAP-PRONGKOL',
            price: 2000,
            sellPrice: 3000,
            attributes: { type: 'Lumps', material: 'Mixed' }
        },
        {
            productName: 'Affal Daun',
            variantName: 'Affal Daun',
            skuCode: 'SCRAP-DAUN',
            price: 1500,
            sellPrice: 2000,
            attributes: { type: 'Trim', material: 'Mixed' }
        }
    ];

    for (const scrap of scrapTypes) {
        const existing = await prisma.productVariant.findUnique({
            where: { skuCode: scrap.skuCode }
        });

        if (!existing) {
            await prisma.product.create({
                data: {
                    name: scrap.productName,
                    productType: ProductType.SCRAP,
                    variants: {
                        create: {
                            name: scrap.variantName,
                            skuCode: scrap.skuCode,
                            price: scrap.price,
                            sellPrice: scrap.sellPrice,
                            primaryUnit: Unit.KG,
                            salesUnit: Unit.KG,
                            conversionFactor: 1.0,
                            attributes: scrap.attributes,
                        },
                    },
                },
            });
            console.log(`✓ ${scrap.skuCode} created`);
        } else {
            console.log(`- ${scrap.skuCode} already exists`);
        }
    }

    console.log('Seeding completed.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
