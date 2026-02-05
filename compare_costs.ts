import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Comparing standardCost vs Catalog Price for ingredients...')

    const skus = ['PKHDT002', 'FGROL009', 'INMIX002']
    const variants = await prisma.productVariant.findMany({
        where: { skuCode: { in: skus } }
    })

    for (const v of variants) {
        console.log(`\nSKU: ${v.skuCode}`)
        console.log(` - Standard Cost: ${v.standardCost}`)
        console.log(` - Buy Price: ${v.buyPrice}`)
        console.log(` - Price (Catalog): ${v.price}`)
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
