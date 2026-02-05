import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Listing all BOMs for PKHDT002...')

    const variant = await prisma.productVariant.findUnique({
        where: { skuCode: 'PKHDT002' },
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

    for (const bom of variant.productionBoms) {
        console.log(`\nBOM: ${bom.name}, Output Qty: ${bom.outputQuantity}, Default: ${bom.isDefault}`)
        let total = 0
        for (const item of bom.items) {
            const v = item.productVariant
            const cost = Number(v.standardCost ?? v.buyPrice ?? v.price ?? 0)
            const qty = Number(item.quantity)
            const scrap = 1 + (Number(item.scrapPercentage ?? 0) / 100)
            const sub = cost * qty * scrap
            total += sub
            console.log(` - ${v.skuCode}: Cost=${cost} (${v.standardCost ? 'std' : (v.buyPrice ? 'buy' : 'price')}), Qty=${qty}, Scrap=${item.scrapPercentage}%, Sub=${sub}`)
        }
        console.log(`Total Batch: ${total}`)
        console.log(`Unit Cost: ${total / Number(bom.outputQuantity)}`)
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
