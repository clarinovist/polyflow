import { Prisma } from '@prisma/client';
import { OPERATIONAL_STATUSES } from '@/lib/sales/order-phase';
import { ownerCustomerRowSchema, ownerMovementRowSchema, ownerPriceRowSchema, ownerRegionRowSchema } from '@/lib/learning/owner-contracts';

/** Current-state snapshots, not immutable revenue/consumption facts. All SQL is
 * parameterized and executes inside the caller's explicit tenant READ ONLY tx. */
export async function collectOwnerCommerce(db: Prisma.TransactionClient, start: Date, end: Date) {
    const orders = Prisma.sql`o."orderDate" >= ${start} AND o."orderDate" < ${end}
        AND o."createdAt" < ${end} AND o.status::text IN (${Prisma.join([...OPERATIONAL_STATUSES])})`;
    const customerRows = await db.$queryRaw<Array<{ customerId: string | null; orderType: string; status: string; orderCount: bigint; firstOrderAt: Date; lastOrderAt: Date; orderValue: string; missingValueCount: bigint }>>(Prisma.sql`
        SELECT o."customerId", o."orderType"::text, o.status::text, COUNT(*) AS "orderCount",
            MIN(o."orderDate") AS "firstOrderAt", MAX(o."orderDate") AS "lastOrderAt",
            COALESCE(SUM(o."totalAmount"),0)::text AS "orderValue",
            COUNT(*) FILTER (WHERE o."totalAmount" IS NULL) AS "missingValueCount"
        FROM "SalesOrder" o WHERE ${orders}
        GROUP BY o."customerId", o."orderType", o.status
        ORDER BY o."customerId" NULLS LAST, o."orderType", o.status LIMIT 201
    `);
    const priceRows = await db.$queryRaw<Array<{ customerId: string | null; variantId: string; unit: string; orderType: string; ppnMode: string; taxPercent: string; discountPercent: string; priceStatus: string | null; reviewStatus: string; basis: string; lineCount: bigint; quantity: string; minPrice: string; maxPrice: string }>>(Prisma.sql`
        WITH lines AS (
            SELECT o."customerId", i."productVariantId" AS "variantId", o."orderType"::text AS "orderType",
                i."ppnMode"::text AS "ppnMode", COALESCE(i."taxPercent",0)::text AS "taxPercent",
                COALESCE(i."discountPercent",0)::text AS "discountPercent", o."priceStatus"::text AS "priceStatus",
                o."commercialReviewStatus"::text AS "reviewStatus",
                CASE WHEN i."enteredUnit" IS NOT NULL AND i."enteredQuantity" > 0 AND i."enteredUnitPrice" IS NOT NULL AND i."conversionFactorSnapshot" > 0 THEN i."enteredUnit"::text ELSE v."primaryUnit"::text END AS unit,
                CASE WHEN i."enteredUnit" IS NOT NULL AND i."enteredQuantity" > 0 AND i."enteredUnitPrice" IS NOT NULL AND i."conversionFactorSnapshot" > 0 THEN 'ENTERED_SNAPSHOT' ELSE 'PRIMARY_CURRENT_LABEL' END AS basis,
                CASE WHEN i."enteredUnit" IS NOT NULL AND i."enteredQuantity" > 0 AND i."enteredUnitPrice" IS NOT NULL AND i."conversionFactorSnapshot" > 0 THEN i."enteredQuantity" ELSE i.quantity END AS quantity,
                CASE WHEN i."enteredUnit" IS NOT NULL AND i."enteredQuantity" > 0 AND i."enteredUnitPrice" IS NOT NULL AND i."conversionFactorSnapshot" > 0 THEN i."enteredUnitPrice" ELSE i."unitPrice" END AS price
            FROM "SalesOrder" o JOIN "SalesOrderItem" i ON i."salesOrderId"=o.id
            JOIN "ProductVariant" v ON v.id=i."productVariantId"
            WHERE ${orders} AND NOT i."isFreeItem" AND i.quantity > 0 AND i."unitPrice" >= 0
        ) SELECT "customerId", "variantId", unit, "orderType", "ppnMode", "taxPercent", "discountPercent", "priceStatus", "reviewStatus", basis,
            COUNT(*) AS "lineCount", SUM(quantity)::text AS quantity, MIN(price)::text AS "minPrice", MAX(price)::text AS "maxPrice"
        FROM lines GROUP BY "customerId", "variantId", unit, "orderType", "ppnMode", "taxPercent", "discountPercent", "priceStatus", "reviewStatus", basis
        ORDER BY "customerId" NULLS LAST, "variantId", unit, "orderType", "ppnMode", "taxPercent", "discountPercent", "priceStatus", "reviewStatus", basis LIMIT 301
    `);
    const regionRows = await db.$queryRaw<Array<{ province: string | null; city: string | null; orderCount: bigint }>>(Prisma.sql`
        SELECT NULLIF(BTRIM(c.province),'') AS province, NULLIF(BTRIM(c.city),'') AS city, COUNT(*) AS "orderCount"
        FROM "SalesOrder" o LEFT JOIN "Customer" c ON c.id=o."customerId" WHERE ${orders}
        GROUP BY NULLIF(BTRIM(c.province),''), NULLIF(BTRIM(c.city),'')
        ORDER BY province NULLS LAST, city NULLS LAST LIMIT 201
    `);
    const movementRows = await db.$queryRaw<Array<{ customerId: string | null; variantId: string; unit: string; kind: string; state: string; quantity: string; lineCount: bigint }>>(Prisma.sql`
        WITH movements AS (
            SELECT o."customerId", i."productVariantId" AS "variantId", v."primaryUnit"::text AS unit,
                'DISPATCH' AS kind, d.status::text AS state, i.quantity
            FROM "DeliveryOrder" d JOIN "SalesOrder" o ON o.id=d."salesOrderId"
            JOIN "DeliveryOrderItem" i ON i."deliveryOrderId"=d.id JOIN "ProductVariant" v ON v.id=i."productVariantId"
            WHERE d."stockCommittedAt" >= ${start} AND d."stockCommittedAt" < ${end} AND d."createdAt" < ${end}
                AND d.status IN ('SHIPPED','IN_TRANSIT','ARRIVED','DELIVERED','RETURNED')
            UNION ALL
            SELECT o."customerId", i."productVariantId", v."primaryUnit"::text,
                'RETURN_RECEIVED', i.condition::text, receipt.quantity
            FROM "SalesReturnReceiptLine" receipt JOIN "SalesReturnItem" i ON i.id=receipt."returnItemId"
            JOIN "SalesReturn" r ON r.id=i."salesReturnId" JOIN "SalesOrder" o ON o.id=r."salesOrderId"
            JOIN "ProductVariant" v ON v.id=i."productVariantId"
            WHERE receipt."receivedAt" >= ${start} AND receipt."receivedAt" < ${end}
                AND r.status IN ('RECEIVED','COMPLETED')
        ) SELECT "customerId", "variantId", unit, kind, state, SUM(quantity)::text AS quantity, COUNT(*) AS "lineCount"
        FROM movements GROUP BY "customerId", "variantId", unit, kind, state
        ORDER BY "customerId" NULLS LAST, "variantId", unit, kind, state LIMIT 301
    `);
    return {
        customers: customerRows.slice(0, 200).map(row => ownerCustomerRowSchema.parse({ ...row, orderCount: Number(row.orderCount), missingValueCount: Number(row.missingValueCount), firstOrderAt: row.firstOrderAt.toISOString(), lastOrderAt: row.lastOrderAt.toISOString() })),
        prices: priceRows.slice(0, 300).map(row => ownerPriceRowSchema.parse({ ...row, lineCount: Number(row.lineCount) })),
        regions: regionRows.slice(0, 200).map(row => ownerRegionRowSchema.parse({ ...row, orderCount: Number(row.orderCount) })),
        movements: movementRows.slice(0, 300).map(row => ownerMovementRowSchema.parse({ ...row, lineCount: Number(row.lineCount) })),
        truncated: { customers: customerRows.length > 200, prices: priceRows.length > 300, regions: regionRows.length > 200, movements: movementRows.length > 300 },
    };
}
