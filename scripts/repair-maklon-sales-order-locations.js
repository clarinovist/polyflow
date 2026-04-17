/* eslint-disable no-console */
const { PrismaClient, LocationType, SalesOrderType, SalesOrderStatus } = require('@prisma/client');

const prisma = new PrismaClient();

const DEFAULT_TARGET_SLUG = 'customer_owned_storage';
const DEFAULT_TARGET_NAME = 'Customer Warehouse';
const DEFAULT_TARGET_DESCRIPTION = 'Default customer-owned warehouse for Maklon Jasa sales orders';

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    execute: false,
    yes: false,
    createMissing: false,
    includeCancelled: false,
    orderNumber: null,
    targetSlug: DEFAULT_TARGET_SLUG,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--execute' || arg === '--apply') {
      options.execute = true;
      continue;
    }

    if (arg === '--yes' || arg === '--confirm') {
      options.yes = true;
      continue;
    }

    if (arg === '--create-missing') {
      options.createMissing = true;
      continue;
    }

    if (arg === '--include-cancelled') {
      options.includeCancelled = true;
      continue;
    }

    if (arg === '--order-number') {
      options.orderNumber = args[index + 1] || null;
      index += 1;
      continue;
    }

    if (arg === '--target-slug') {
      options.targetSlug = args[index + 1] || DEFAULT_TARGET_SLUG;
      index += 1;
    }
  }

  options.dryRun = !(options.execute && options.yes);
  return options;
}

async function ensureTargetLocation(tx, options, canCreate) {
  const existing = await tx.location.findUnique({
    where: { slug: options.targetSlug },
    select: { id: true, slug: true, name: true, locationType: true },
  });

  if (existing) {
    if (existing.locationType !== LocationType.CUSTOMER_OWNED) {
      throw new Error(
        `Target location '${existing.name}' (${existing.slug}) exists but is not CUSTOMER_OWNED.`
      );
    }

    return existing;
  }

  if (!canCreate) {
    throw new Error(
      `Target location slug '${options.targetSlug}' was not found. Re-run with --create-missing if you want the script to create it.`
    );
  }

  return tx.location.create({
    data: {
      slug: options.targetSlug,
      name: DEFAULT_TARGET_NAME,
      description: DEFAULT_TARGET_DESCRIPTION,
      locationType: LocationType.CUSTOMER_OWNED,
    },
    select: { id: true, slug: true, name: true, locationType: true },
  });
}

function isInvalidMaklonLocation(order) {
  if (!order.sourceLocationId) {
    return true;
  }

  if (!order.sourceLocation) {
    return true;
  }

  return order.sourceLocation.locationType !== LocationType.CUSTOMER_OWNED;
}

function formatOrderLine(order, targetLocation) {
  const currentLocationName = order.sourceLocation
    ? `${order.sourceLocation.name} (${order.sourceLocation.slug || 'no-slug'})`
    : 'None';
  const customerName = order.customer?.name || 'No customer';

  return [
    order.orderNumber,
    `status=${order.status}`,
    `customer=${customerName}`,
    `current=${currentLocationName}`,
    `target=${targetLocation.name} (${targetLocation.slug})`,
  ].join(' | ');
}

async function main() {
  const options = parseArgs(process.argv);

  console.log('Maklon sales order location repair start');
  console.log(`Mode: ${options.dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
  console.log(`Target slug: ${options.targetSlug}`);
  if (options.orderNumber) {
    console.log(`Scoped to order: ${options.orderNumber}`);
  }

  await prisma.$transaction(async (tx) => {
    const orders = await tx.salesOrder.findMany({
      where: {
        orderType: SalesOrderType.MAKLON_JASA,
        ...(options.includeCancelled ? {} : { status: { not: SalesOrderStatus.CANCELLED } }),
        ...(options.orderNumber ? { orderNumber: options.orderNumber } : {}),
      },
      include: {
        customer: { select: { name: true } },
        sourceLocation: { select: { id: true, name: true, slug: true, locationType: true } },
      },
      orderBy: { orderDate: 'asc' },
    });

    const invalidOrders = orders.filter(isInvalidMaklonLocation);

    if (invalidOrders.length === 0) {
      console.log('No invalid Maklon Jasa sales orders found.');
      return;
    }

    let targetLocation = await tx.location.findUnique({
      where: { slug: options.targetSlug },
      select: { id: true, slug: true, name: true, locationType: true },
    });

    if (!targetLocation && options.dryRun) {
      console.log(
        `Target location slug '${options.targetSlug}' does not exist yet. Dry-run will continue, and execute mode can create it with --create-missing.`
      );
      targetLocation = {
        id: null,
        slug: options.targetSlug,
        name: DEFAULT_TARGET_NAME,
        locationType: LocationType.CUSTOMER_OWNED,
      };
    } else if (!targetLocation) {
      targetLocation = await ensureTargetLocation(tx, options, options.createMissing);
    }

    console.log(`Found ${invalidOrders.length} Maklon Jasa sales orders with non-customer-owned source locations:`);
    for (const order of invalidOrders) {
      console.log(`- ${formatOrderLine(order, targetLocation)}`);
    }

    if (options.dryRun) {
      console.log('Dry-run complete. Re-run with --execute --yes to update these orders.');
      return;
    }

    let updatedCount = 0;

    for (const order of invalidOrders) {
      if (order.sourceLocationId === targetLocation.id) {
        continue;
      }

      await tx.salesOrder.update({
        where: { id: order.id },
        data: { sourceLocationId: targetLocation.id },
      });

      updatedCount += 1;
      console.log(`Updated ${order.orderNumber} -> ${targetLocation.name} (${targetLocation.slug})`);
    }

    console.log(`Repair complete. Updated ${updatedCount} sales order(s).`);
  });
}

main()
  .catch((error) => {
    console.error('Maklon sales order location repair failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });