
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const targetId = '6ee864c1-ab7c-4426-931c-becec12cf6ac';
    console.log(`Analyzing Variant ID: ${targetId}...`);

    // 1. Variant Details
    const variant = await prisma.productVariant.findUnique({
        where: { id: targetId },
        include: { product: true, inventories: { include: { location: true } } }
    });

    if (!variant) {
        console.log('Variant not found');
        return;
    }

    console.log(`Variant: ${variant.product.name} - ${variant.name}`);
    console.log('Current Stock:');
    variant.inventories.forEach(inv => console.log(`  - ${inv.location.name}: ${inv.quantity}`));

    // 2. Production Orders
    const pos = await prisma.productionOrder.findMany({
        where: { bom: { productVariantId: targetId } },
        orderBy: { createdAt: 'desc' },
        take: 5
    });

    console.log('\n--- Production Orders ---');
    for (const po of pos) {
        console.log(`PO: ${po.orderNumber} | Status: ${po.status} | Planned: ${po.plannedQuantity} | Produced: ${po.actualQuantity}`);

        const executions = await prisma.productionExecution.findMany({
            where: { productionOrderId: po.id }
        });

        const totalExecOutput = executions.reduce((sum, ex) => sum + Number(ex.quantityProduced), 0);
        const totalExecScrap = executions.reduce((sum, ex) => sum + Number(ex.scrapQuantity), 0);


        const scrapRecords = await prisma.scrapRecord.findMany({
            where: { productionOrderId: po.id }
        });
        const totalScrapRecord = scrapRecords.reduce((sum, s) => sum + Number(s.quantity), 0);
        console.log(`   > ScrapRecord Table Sum: ${totalScrapRecord}`);
        scrapRecords.forEach(s => console.log(`     - Scrap ID: ${s.id.substring(0, 8)} | Qty: ${s.quantity} | Reason: ${s.reason}`));

        // Check Material Issues (Input)
        const materialIssues = await prisma.materialIssue.findMany({
            where: { productionOrderId: po.id }
        });
        const totalInput = materialIssues.reduce((sum, m) => sum + Number(m.quantity), 0);
        console.log(`   > Material Input Sum: ${totalInput}`);

        console.log(`   > Executions Sum -> Output: ${totalExecOutput} | Scrap: ${totalExecScrap}`);
        executions.forEach(ex => {
            console.log(`     - Exec ID: ${ex.id.substring(0, 8)} | Qty: ${ex.quantityProduced} | Scrap: ${ex.scrapQuantity} | Date: ${ex.createdAt.toISOString()}`);
        });
    }

    // 3. Stock Movements
    const movements = await prisma.stockMovement.findMany({
        where: { productVariantId: targetId },
        orderBy: { createdAt: 'desc' },
        take: 10
    });

    console.log('\n--- Stock Movements ---');
    movements.forEach(m => {
        console.log(`Type: ${m.type} | Qty: ${m.quantity} | Ref: ${m.reference || 'N/A'} | PO: ${m.productionOrderId || 'N/A'} | Date: ${m.createdAt.toISOString()}`);
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
