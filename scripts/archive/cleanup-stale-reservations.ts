import { PrismaClient, ReservationType, ReservationStatus, SalesOrderStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Starting cleanup of stale reservations...");

    // Find all ACTIVE reservations for SALES_ORDER
    const activeReservations = await prisma.stockReservation.findMany({
        where: {
            status: ReservationStatus.ACTIVE,
            reservedFor: ReservationType.SALES_ORDER,
            referenceId: { not: '' }
        }
    });

    console.log(`Found ${activeReservations.length} active SALES_ORDER reservations.`);

    let fixedCount = 0;

    for (const res of activeReservations) {
        if (!res.referenceId) continue;

        // Check the status of the related Sales Order
        const order = await prisma.salesOrder.findUnique({
            where: { id: res.referenceId },
            select: { id: true, status: true, orderNumber: true }
        });

        if (!order) {
            console.warn(`Sales Order ${res.referenceId} not found for reservation ${res.id}. Skipping.`);
            continue;
        }

        // If the order is Shipped, Delivered, or Cancelled, the reservation should not be Active
        if (
            order.status === SalesOrderStatus.SHIPPED ||
            order.status === SalesOrderStatus.DELIVERED ||
            order.status === SalesOrderStatus.CANCELLED
        ) {
            const newStatus = order.status === SalesOrderStatus.CANCELLED
                ? ReservationStatus.CANCELLED
                : ReservationStatus.FULFILLED;

            console.log(`Fixing stale reservation for ${order.orderNumber} (Status: ${order.status}). Changing reservation from ACTIVE to ${newStatus}.`);

            await prisma.stockReservation.update({
                where: { id: res.id },
                data: { status: newStatus }
            });

            fixedCount++;
        }
    }

    console.log(`\nCleanup complete. Fixed ${fixedCount} stale reservations.`);
}

main()
    .catch(e => {
        console.error("Error during cleanup:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
