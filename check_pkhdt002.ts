import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Checking PKHDT002 and its BOM ingredients...')

    const variant = await prisma.productVariant.findUnique({
        where: { skuCode: 'PKHDT002' },
        include: {
            productionBoms: {
                include: {
                    items: {
                        include: {
                            productVariant: {
                                include: {
                                    product: true
                                }
                            }
                        }
                    }
                }
            }
        }
    })

    if (!variant) {
        console.log('Variant PKHDT002 not found.')
        return
    }

    console.log(`Product: ${variant.name} (${variant.skuCode})`)
    console.log(`Standard Cost: ${variant.standardCost}`)
    console.log(`Buy Price: ${variant.buyPrice}`)
    console.log(`Price: ${variant.price}`)

    if (variant.productionBoms.length > 0) {
        const bom = variant.productionBoms[0]
        console.log(`\nBOM: ${bom.name}`)
        console.log(`Output Quantity: ${bom.outputQuantity}`)

        for (const item of bom.items) {
            const v = item.productVariant
            console.log(`\nIngredient: ${v.name} (${v.skuCode})`)
            console.log(` - Standard Cost: ${v.standardCost}`)
            console.log(` - Buy Price: ${v.buyPrice}`)
            console.log(` - Price (Katalog): ${v.price}`)
            console.log(` - Quantity in BOM: ${item.quantity}`)
        }
    } else {
        console.log('\nNo BOM found for PKHDT002.')
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
