import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Checking FGROL013 and its BOM ingredients...')

    const variant = await prisma.productVariant.findUnique({
        where: { skuCode: 'FGROL013' },
        include: {
            productionBoms: {
                include: {
                    items: {
                        include: {
                            productVariant: true
                        }
                    }
                }
            }
        }
    })

    if (!variant) return

    console.log(`Product: ${variant.name} (${variant.skuCode})`)
    console.log(`Standard Cost: ${variant.standardCost}`)

    for (const bom of variant.productionBoms) {
        console.log(`\nBOM: ${bom.name}`)
        for (const item of bom.items) {
            const v = item.productVariant
            console.log(` - Ingredient: ${v.skuCode}, Standard Cost: ${v.standardCost}, Buy Price: ${v.buyPrice}, Price: ${v.price}`)
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
