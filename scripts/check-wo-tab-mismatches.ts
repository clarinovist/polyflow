import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function tabFromProductType(productType: string | null): string {
  if (productType === 'INTERMEDIATE') return 'mixing';
  if (productType === 'PACKAGING') return 'packing';
  if (productType === 'WIP' || productType === 'FINISHED_GOOD') return 'extrusion';
  return 'all';
}

function tabFromBomCategory(category: string | null): string {
  if (category === 'MIXING') return 'mixing';
  if (category === 'PACKING') return 'packing';
  if (category === 'EXTRUSION') return 'extrusion';
  return 'all';
}

async function main() {
  const take = 200;
  console.log(`--- Checking WO tab mismatches (last ${take}) ---\n`);

  const orders = await prisma.productionOrder.findMany({
    include: {
      bom: {
        include: {
          productVariant: {
            include: { product: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take
  });

  let mismatchCount = 0;
  for (const order of orders) {
    const product = order.bom.productVariant.product;
    const bomCategory = order.bom.category;
    const actualTab = tabFromProductType(product.productType);
    const expectedTab = tabFromBomCategory(bomCategory);

    if (actualTab !== expectedTab) {
      mismatchCount += 1;
      console.log(
        `${order.orderNumber} | Product: ${product.name} | Type: ${product.productType} | ` +
          `BOM Cat: ${bomCategory} | Tab: ${actualTab} | Expected: ${expectedTab}`
      );
    }
  }

  console.log(`\nMismatches: ${mismatchCount} / ${orders.length}`);
}

main();
