const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw`
    WITH movement_groups AS (
      SELECT
        sm."productionOrderId",
        sm."productVariantId",
        regexp_replace(sm."reference", '^VOID: ', '') AS base_reference,
        SUM(CASE WHEN sm."reference" LIKE 'VOID: %' THEN sm.quantity ELSE 0 END) AS void_qty,
        SUM(CASE WHEN sm."reference" NOT LIKE 'VOID: %' THEN sm.quantity ELSE 0 END) AS original_qty,
        COUNT(*) FILTER (WHERE sm."reference" LIKE 'VOID: %') AS void_count,
        COUNT(*) FILTER (WHERE sm."reference" NOT LIKE 'VOID: %') AS original_count
      FROM "StockMovement" sm
      WHERE sm."productionOrderId" IS NOT NULL
        AND (
          sm."reference" LIKE 'VOID: %'
          OR sm."reference" LIKE 'Production %'
          OR sm."reference" LIKE 'Backflush %'
        )
      GROUP BY 1, 2, 3
    )
    SELECT
      po."orderNumber",
      pv."skuCode",
      mg.base_reference,
      mg.original_qty,
      mg.void_qty,
      mg.original_count,
      mg.void_count,
      (mg.void_qty - mg.original_qty) AS excess_void_qty
    FROM movement_groups mg
    JOIN "ProductionOrder" po ON po.id = mg."productionOrderId"
    JOIN "ProductVariant" pv ON pv.id = mg."productVariantId"
    WHERE mg.void_qty > mg.original_qty
      AND mg.original_qty > 0
    ORDER BY po."orderNumber", pv."skuCode", mg.base_reference
  `;

  if (rows.length === 0) {
    console.log('No duplicate production void anomalies found.');
    return;
  }

  console.log('Duplicate production void anomalies:');
  for (const row of rows) {
    console.log([
      row.orderNumber,
      row.skuCode,
      row.base_reference,
      `original=${row.original_qty}`,
      `void=${row.void_qty}`,
      `excess=${row.excess_void_qty}`,
      `original_count=${row.original_count}`,
      `void_count=${row.void_count}`,
    ].join(' | '));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });