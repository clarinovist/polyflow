import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Listing all items for BOM "Mixed HMP 15"...')

    const bom = await prisma.bom.findFirst({
        where: { name: 'Mixed HMP 15' },
        include: {
            items: {
                include: {
                    productVariant: true
                }
            }
        }
    })

    if (!bom) {
        console.log('BOM "Mixed HMP 15" not found.')
        return
    }

    console.log(`BOM: ${bom.name}, Output Qty: ${bom.outputQuantity}`)
    let totalBatchCost = 0
    for (const item of bom.items) {
        const v = item.productVariant
        const cost = Number(v.standardCost ?? v.buyPrice ?? v.price ?? 0)
        const qty = Number(item.quantity)
        const scrap = 1 + (Number(item.scrapPercentage ?? 0) / 100)
        const subtotal = cost * qty * scrap
        totalBatchCost += subtotal

        console.log(`\nIngredient: ${v.skuCode}`)
        console.log(` - Source used: ${v.standardCost ? 'standardCost' : (v.buyPrice ? 'buyPrice' : 'price')}`)
        console.log(` - Value: ${cost}`)
        console.log(` - Qty: ${qty}`)
        console.log(` - Scrap: ${item.scrapPercentage}%`)
        console.log(` - Subtotal: ${subtotal}`)
    }
    console.log(`\nTotal Batch Cost: ${totalBatchCost}`)
    console.log(`Final Unit Cost: ${totalBatchCost / Number(bom.outputQuantity)}`)
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
