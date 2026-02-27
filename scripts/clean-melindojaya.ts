import { PrismaClient } from '@prisma/client'

const tenantDb = new PrismaClient({
    datasources: {
        db: {
            url: 'postgresql://polyflow:polyflow@localhost:5434/polyflow_melindojaya'
        }
    }
})

async function main() {
    console.log('Cleaning up dummy factory data from melindojaya...')

    // Keep users, accounts, journals. Remove factory data.
    await tenantDb.stockOpnameItem.deleteMany()
    await tenantDb.stockOpname.deleteMany()
    await tenantDb.stockReservation.deleteMany()
    await tenantDb.productionExecution.deleteMany()
    await tenantDb.productionMaterial.deleteMany()
    await tenantDb.productionShift.deleteMany()
    await tenantDb.productionOrder.deleteMany()
    await tenantDb.batch.deleteMany()
    await tenantDb.bomItem.deleteMany()
    await tenantDb.bom.deleteMany()
    await tenantDb.stockMovement.deleteMany()
    await tenantDb.inventory.deleteMany()
    await tenantDb.machine.deleteMany()
    await tenantDb.employee.deleteMany()
    await tenantDb.jobRole.deleteMany()
    await tenantDb.costHistory.deleteMany()
    await tenantDb.productVariant.deleteMany()
    await tenantDb.product.deleteMany()
    await tenantDb.supplier.deleteMany()
    await tenantDb.customer.deleteMany()
    await tenantDb.location.deleteMany()

    console.log('Done cleaning up melindojaya.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await tenantDb.$disconnect()
    })
