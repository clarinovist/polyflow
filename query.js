/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const code = 'WO-MRLQAZRB725LOJ';
  const wo = await prisma.productionOrder.findFirst({
    where: { code },
    include: {
      executions: {
        include: {
          shift: true
        }
      },
      productVariant: true,
      bom: true
    }
  });

  if (!wo) {
    console.log(`Work Order ${code} not found`);
    return;
  }

  console.log('--- WORK ORDER ---');
  console.log('ID:', wo.id);
  console.log('Code:', wo.code);
  console.log('Status:', wo.status);
  console.log('Product Variant:', wo.productVariant?.skuCode, '-', wo.productVariant?.name);
  console.log('Planned Qty:', wo.plannedQuantity);
  console.log('Actual Qty:', wo.actualQuantity);

  console.log('\n--- EXECUTIONS ---');
  for (const exec of wo.executions) {
    console.log({
      id: exec.id,
      startDate: exec.startDate,
      endDate: exec.endDate,
      status: exec.status,
      quantityProduced: exec.quantityProduced,
      operator: exec.operator,
      shiftId: exec.shiftId,
      shiftName: exec.shift?.name,
      shiftStart: exec.shift?.startTime,
      shiftEnd: exec.shift?.endTime
    });
  }

  console.log('\n--- STOCK MOVEMENTS ---');
  const movements = await prisma.stockMovement.findMany({
    where: {
      reference: {
        contains: code
      }
    },
    include: {
      fromLocation: true,
      toLocation: true
    }
  });
  
  for (const m of movements) {
    console.log({
      id: m.id,
      createdAt: m.createdAt,
      type: m.type,
      quantity: m.quantity,
      from: m.fromLocation?.name,
      to: m.toLocation?.name,
      reference: m.reference
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
