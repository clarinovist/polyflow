import { PrismaClient, SalesOrderStatus, SalesOrderType } from '@prisma/client';
import { SalesService } from '../src/services/sales-service'; // Removing .ts extension for build compatibility
// Ts-node with ESM usually requires extension or proper resolution.
// Trying simpler relative path without extension if allowed, or with.
// Previous error: "Cannot find module ... sales-service"
// Maybe TS config issue. Let's try to remove 'src' if mapped? No, it's physically in src.
// Let's rely on relative path that worked before. Wait, I used `../src/services/sales-service`.
// The file is currently in `scripts/verify-phase3.ts`.
// `../src` is correct.
// Maybe I need to run with mapping support? `tsconfig-paths`?
// Let's try adding `tsconfig-paths/register` or just use absolute path via alias if supported.

const prisma = new PrismaClient();

async function main() {
    console.log("Starting Manual Verification for Phase 3...");

    // 1. Setup Data
    console.log("Setting up test data...");

    // Create Test Product
    const product = await prisma.product.create({
        data: {
            name: "Test Widget Phase 3",
            productType: "FINISHED_GOOD",
            // baseUom removed if not in schema or used differently? Checking previous errors: "baseUom does not exist"
        }
    });

    const variant = await prisma.productVariant.create({
        data: {
            productId: product.id,
            name: "Test Widget Variant P3",
            skuCode: `TEST-P3-${Date.now()}`,
            price: 100000,
            buyPrice: 50000,
            primaryUnit: 'PCS' // Added required field
        }
    });

    const location = await prisma.location.findFirst() || await prisma.location.create({
        data: { name: "Test Warehouse", slug: "test-wh-p3" }
    });

    // Add Inventory (10 units)
    await prisma.inventory.create({
        data: {
            locationId: location.id,
            productVariantId: variant.id,
            quantity: 10,
            averageCost: 50000
        }
    });

    // Create User
    const user = await prisma.user.findFirst() || await prisma.user.create({
        data: { email: "tester@polyflow.com", name: "Tester", role: "ADMIN", password: "hash" }
    });

    // Create Customer with Credit Limit 500k
    const customer = await prisma.customer.create({
        data: {
            name: "Credit Test Co",
            creditLimit: 500000,
            // termDays removed
        }
    });

    // 2. Test Success Case: Order under limit
    console.log("\n--- Test 1: Order Under Credit Limit ---");
    const order1 = await SalesService.createOrder({
        customerId: customer.id,
        sourceLocationId: location.id,
        orderDate: new Date(),
        orderType: "MAKE_TO_STOCK",
        items: [{ productVariantId: variant.id, quantity: 2, unitPrice: 100000, discountPercent: 0, taxPercent: 0 }]
    }, user.id);
    console.log(`Order 1 Created: ${order1.orderNumber}`);

    await SalesService.confirmOrder(order1.id, user.id);
    console.log("Order 1 Confirmed (Success)");

    // Verify Reservation
    const reservations1 = await prisma.stockReservation.findMany({ where: { referenceId: order1.id } });
    console.log(`Reservations for Order 1: ${reservations1.length} (Expected 1)`);
    if (reservations1.length !== 1 || reservations1[0].quantity.toNumber() !== 2) throw new Error("Reservation Failed");


    // 3. Test Failure Case: Order Exceeding Limit
    console.log("\n--- Test 2: Order Exceeding Credit Limit ---");
    // Current Exposure: 200k. Limit 500k. Available: 300k.
    // Try to order 4 units (400k) -> Should Fail.
    const order2 = await SalesService.createOrder({
        customerId: customer.id,
        sourceLocationId: location.id,
        orderDate: new Date(),
        orderType: "MAKE_TO_STOCK",
        items: [{ productVariantId: variant.id, quantity: 4, unitPrice: 100000, discountPercent: 0, taxPercent: 0 }]
    }, user.id);
    console.log(`Order 2 Created: ${order2.orderNumber}`);

    try {
        await SalesService.confirmOrder(order2.id, user.id);
        console.error("Order 2 Confirmed (UNEXPECTED!)");
    } catch (e) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.log(`Order 2 Confirmation Blocked as Expected: ${(e as any).message}`);
    }


    // 4. Test Shipment & Reservation Fulfillment
    console.log("\n--- Test 3: Shipment & Reservation Fufillment ---");
    await SalesService.shipOrder(order1.id, user.id);
    console.log("Order 1 Shipped");

    const finalReservation = await prisma.stockReservation.findFirst({ where: { referenceId: order1.id } });
    console.log(`Reservation Status: ${finalReservation?.status} (Expected FULFILLED)`);

    const finalStock = await prisma.inventory.findUnique({
        where: { locationId_productVariantId: { locationId: location.id, productVariantId: variant.id } }
    });
    console.log(`Final Physical Stock: ${finalStock?.quantity.toNumber()} (Expected 8)`);

    console.log("\n✅ Verification Complete!");

    // Cleanup
    await prisma.stockReservation.deleteMany({ where: { productVariantId: variant.id } });
    await prisma.stockMovement.deleteMany({ where: { productVariantId: variant.id } });
    await prisma.salesOrderItem.deleteMany({ where: { productVariantId: variant.id } });
    await prisma.salesOrder.deleteMany({ where: { customerId: customer.id } });
    await prisma.invoice.deleteMany({ where: { salesOrder: { customerId: customer.id } } });
    await prisma.inventory.deleteMany({ where: { productVariantId: variant.id } });
    await prisma.productVariant.delete({ where: { id: variant.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
