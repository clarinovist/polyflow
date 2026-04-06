const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orderNumber = 'SO-2026-0017';
  console.log(`Searching for ${orderNumber}...`);
  const so = await prisma.salesOrder.findUnique({
    where: { orderNumber }, 
    include: { movements: true, invoices: true, deliveryOrders: true }
  });
  
  if(!so) {
    console.log("SO not found");
    return;
  }
  
  console.log(`Found SO. Reverting stock for ${so.movements.length} movements...`);
  // 1. Revert stock
  for (const mov of so.movements) {
      if (mov.type === 'OUT') {
          // Increase stock back
          await prisma.inventory.updateMany({
              where: {
                  locationId: mov.fromLocationId,
                  productVariantId: mov.productVariantId
              },
              data: { quantity: { increment: mov.quantity } }
          });
          // Create an IN movement for reversal
          await prisma.stockMovement.create({
              data: {
                  type: 'IN',
                  productVariantId: mov.productVariantId,
                  toLocationId: mov.fromLocationId,
                  quantity: mov.quantity,
                  reference: `VOID SO: ${orderNumber}`,
                  salesOrderId: so.id,
                  createdById: so.createdById
              }
          });
          console.log(`Returned quantity ${mov.quantity} for variant ${mov.productVariantId}`);
      }
  }

  // 2. Cancel DO
  const doResult = await prisma.deliveryOrder.updateMany({
      where: { salesOrderId: so.id },
      data: { status: 'CANCELLED' }
  });
  console.log(`Cancelled ${doResult.count} Delivery Orders.`);

  // 3. Cancel Invoice
  const invResult = await prisma.invoice.updateMany({
      where: { salesOrderId: so.id },
      data: { status: 'CANCELLED' }
  });
  console.log(`Cancelled ${invResult.count} Invoices.`);

  // 4. Cancel SO
  await prisma.salesOrder.update({
      where: { id: so.id },
      data: { status: 'CANCELLED' }
  });
  console.log(`Cancelled Sales Order.`);

  console.log(`Successfully reversed stock and cancelled SO, DO, and Invoice for ${orderNumber}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
