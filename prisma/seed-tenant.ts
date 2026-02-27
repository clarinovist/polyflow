import { PrismaClient, Role } from '@prisma/client'
import { seedCoA } from './seed-coa';

const prisma = new PrismaClient()

async function main() {
    console.log('Seeding minimal tenant database...')

    // 0. Cleanup
    console.log('Cleaning up existing data...')
    await prisma.auditLog.deleteMany()
    await prisma.invoice.deleteMany()
    await prisma.purchaseInvoice.deleteMany()
    await prisma.purchasePayment.deleteMany()
    await prisma.deliveryOrderItem.deleteMany()
    await prisma.deliveryOrder.deleteMany()
    await prisma.salesOrderItem.deleteMany()
    await prisma.salesOrder.deleteMany()
    await prisma.salesQuotationItem.deleteMany()
    await prisma.salesQuotation.deleteMany()
    await prisma.goodsReceiptItem.deleteMany()
    await prisma.goodsReceipt.deleteMany()
    await prisma.purchaseOrderItem.deleteMany()
    await prisma.purchaseOrder.deleteMany()
    await prisma.purchaseRequestItem.deleteMany()
    await prisma.purchaseRequest.deleteMany()
    await prisma.qualityInspection.deleteMany()
    await prisma.scrapRecord.deleteMany()
    await prisma.materialIssue.deleteMany()
    await prisma.productionMaterial.deleteMany()
    await prisma.productionExecution.deleteMany()
    await prisma.productionShift.deleteMany()
    await prisma.productionOrder.deleteMany()
    await prisma.stockReservation.deleteMany()
    await prisma.stockOpnameItem.deleteMany()
    await prisma.stockOpname.deleteMany()
    await prisma.batch.deleteMany()
    await prisma.bomItem.deleteMany()
    await prisma.bom.deleteMany()
    await prisma.stockMovement.deleteMany()
    await prisma.inventory.deleteMany()
    await prisma.machine.deleteMany()
    await prisma.employee.deleteMany()
    await prisma.jobRole.deleteMany()
    await prisma.costHistory.deleteMany()
    await prisma.productVariant.deleteMany()
    await prisma.product.deleteMany()
    await prisma.supplier.deleteMany()
    await prisma.customer.deleteMany()
    await prisma.location.deleteMany()
    await prisma.fixedAsset.deleteMany()
    await prisma.journalLine.deleteMany()
    await prisma.journalEntry.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()

    // 1. Setup Tenant Admin
    console.log('Seeding tenant admin...')

    const adminEmail = process.env.TENANT_ADMIN_EMAIL || 'admin@polyflow.uk';
    const adminName = process.env.TENANT_ADMIN_NAME || 'Admin User';
    const adminPasswordHash = process.env.TENANT_ADMIN_PASSWORD_HASH || '$2b$10$685SgQ9PlWgUVPVboe41IeSTp91HZbbUC1smuzHclY.Qdl4TglIaW';

    await prisma.user.create({
        data: {
            email: adminEmail,
            name: adminName,
            password: adminPasswordHash,
            role: Role.ADMIN,
        }
    })

    // 2. Chart of Accounts (Required for Auto-Journaling)
    console.log('Seeding Chart of Accounts...')
    await seedCoA();

    console.log('Minimal tenant seeding completed.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
